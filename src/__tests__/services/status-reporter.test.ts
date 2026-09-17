import { CredentialReminderStore, StatusReporter } from '../../services/status-reporter';
import { SyncOutcome, emptyOutcome } from '../../services/sync/sync-run/sync-outcome';
import { TaskProviderError } from '../../services/task-provider-error';
import { Logger } from '../../utils/logger';

function outcomeWith(overrides: Partial<SyncOutcome> = {}): SyncOutcome {
  return { ...emptyOutcome({ kind: 'configured' }), filesScanned: 2, linkedTasks: 3, ...overrides };
}

function spyOnLevels(): { debug: jest.SpyInstance; info: jest.SpyInstance } {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();

  return {
    debug: jest.spyOn(Logger.prototype, 'debug').mockImplementation(),
    info: jest.spyOn(Logger.prototype, 'info').mockImplementation(),
  };
}

function reminderStoreAt(initialAt = 0): CredentialReminderStore {
  let lastAt = initialAt;
  return { get: () => lastAt, set: (at) => (lastAt = at) };
}

function reporter(notify: (message: string) => void = () => undefined, reminders = reminderStoreAt()): StatusReporter {
  return new StatusReporter(new Logger('test'), notify, reminders);
}

describe('StatusReporter.reportSyncOutcome for a quiet sync', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports the first one at info, so the log shows syncing works at all', () => {
    const { info } = spyOnLevels();

    reporter().reportSyncOutcome(outcomeWith());

    expect(info).toHaveBeenCalledWith('Task sync is up to date', { filesScanned: 2, linkedTasks: 3 });
  });

  it('logs one at debug once what it covers has already been reported', () => {
    const { debug, info } = spyOnLevels();
    const statusReporter = reporter();

    statusReporter.reportSyncOutcome(outcomeWith());
    statusReporter.reportSyncOutcome(outcomeWith());

    expect(info).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith('Task sync finished with nothing to do');
  });

  it('reports one at info again once the notes or links it covers change', () => {
    const { info } = spyOnLevels();
    const statusReporter = reporter();

    statusReporter.reportSyncOutcome(outcomeWith());
    statusReporter.reportSyncOutcome(outcomeWith({ linkedTasks: 4 }));

    expect(info).toHaveBeenCalledTimes(2);
  });

  it('reports one at info again after a failure, so the recovery shows', () => {
    const { info } = spyOnLevels();
    const statusReporter = reporter();

    statusReporter.reportSyncOutcome(outcomeWith());
    statusReporter.reportSyncFailure(new TaskProviderError('unreachable'));
    statusReporter.reportSyncOutcome(outcomeWith());

    expect(info).toHaveBeenCalledTimes(2);
  });
});

describe('StatusReporter.reportSyncOutcome for a sync that changed something', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each<[string, Partial<SyncOutcome>]>([
    ['created', { created: 1 }],
    ['pushed', { pushed: 1 }],
    ['pulled', { pulled: 1 }],
    ['removedLine', { removedLine: 1 }],
    ['removedTask', { removedTask: 1 }],
    ['recreatedTask', { recreatedTask: 1 }],
    ['resurrectedLine', { resurrectedLine: 1 }],
    ['flaggedOrphans', { flaggedOrphans: 1 }],
    ['unflaggedOrphans', { unflaggedOrphans: 1 }],
    ['removedOrphans', { removedOrphans: 1 }],
    ['skippedEdits', { skippedEdits: 1 }],
    ['abandonedCreations', { abandonedCreations: 1 }],
  ])('logs every counter at info, not debug, when %s is non-zero', (_name, overrides) => {
    const { debug, info } = spyOnLevels();
    const outcome = outcomeWith(overrides);

    reporter().reportSyncOutcome(outcome);

    expect(info).toHaveBeenCalledWith('Task sync finished', outcome);
    expect(debug).not.toHaveBeenCalled();
  });
});

describe('StatusReporter.reportSyncFailure', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a repeat of the same failure at debug rather than not at all', () => {
    const { debug } = spyOnLevels();
    const statusReporter = reporter();

    statusReporter.reportSyncFailure(new TaskProviderError('unreachable'));
    statusReporter.reportSyncFailure(new TaskProviderError('unreachable'));

    expect(debug).toHaveBeenCalledWith('Task sync failed again for the same reason', expect.any(String));
  });

  it('reports a second, different unexpected error at error level too', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const statusReporter = reporter();

    statusReporter.reportSyncFailure(new TypeError('first bug'));
    statusReporter.reportSyncFailure(new RangeError('second bug'));

    expect(error).toHaveBeenCalledTimes(2);
  });
});

describe('StatusReporter.reportConnectionStatus', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the error behind a failed connection check, not only its message', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const cause = new TypeError('a bug while connecting');

    reporter().reportConnectionStatus({ state: 'failed', failure: 'unexpected', message: 'Failed.', error: cause });

    expect(error).toHaveBeenCalledWith('Task provider connection failed', cause);
  });
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const A_MOMENT_AGO_MS = 1000;

describe('StatusReporter reminding about a token missing on this device', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('notifies and records the time the first time it is seen, from a failed connection check', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const notify = jest.fn();
    const reminders = reminderStoreAt(0);
    const now = 10_000;

    reporter(notify, reminders).reportConnectionStatus(
      { state: 'failed', failure: 'token-missing-on-device', message: 'Missing here.', error: undefined },
      now,
    );

    expect(notify).toHaveBeenCalledWith('Missing here.');
    expect(reminders.get()).toBe(now);
  });

  it('notifies and records the time the first time it is seen, from a sync failure', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const notify = jest.fn();
    const reminders = reminderStoreAt(0);
    const now = 10_000;

    reporter(notify, reminders).reportSyncFailure(new TaskProviderError('token-missing-on-device'), now);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(reminders.get()).toBe(now);
  });

  it('stays quiet on a repeat within the same day', () => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const notify = jest.fn();
    const firstNotifiedAt = 10_000;
    const reminders = reminderStoreAt(firstNotifiedAt);

    reporter(notify, reminders).reportSyncFailure(
      new TaskProviderError('token-missing-on-device'),
      firstNotifiedAt + A_MOMENT_AGO_MS,
    );

    expect(notify).not.toHaveBeenCalled();
    expect(reminders.get()).toBe(firstNotifiedAt);
  });

  it('reminds again once a day has passed', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const notify = jest.fn();
    const firstNotifiedAt = 10_000;
    const reminders = reminderStoreAt(firstNotifiedAt);
    const aDayLater = firstNotifiedAt + ONE_DAY_MS;

    reporter(notify, reminders).reportSyncFailure(new TaskProviderError('token-missing-on-device'), aDayLater);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(reminders.get()).toBe(aDayLater);
  });

  it('does not disturb the ordinary once-per-session dedupe used for every other failure', () => {
    const { debug } = spyOnLevels();
    const statusReporter = reporter();

    statusReporter.reportSyncFailure(new TaskProviderError('invalid-credentials'));
    statusReporter.reportSyncFailure(new TaskProviderError('invalid-credentials'));

    expect(debug).toHaveBeenCalledWith('Task sync failed again for the same reason', expect.any(String));
  });
});
