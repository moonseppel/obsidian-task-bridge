// Imported for its side effect: the mock installs the `window` timer shim the scheduler runs on.
import 'obsidian';
import { SyncScheduler } from '../../../../services/sync/sync-run/sync-scheduler';

/** Just past the scheduler's 10s debounce, so a scheduled pass has certainly fired. */
const DEBOUNCE_GRACE_MS = 10_500;
const ONE_MINUTE_MS = 60_000;

function schedulerWith(): { scheduler: SyncScheduler; run: jest.Mock } {
  const run = jest.fn();
  return { scheduler: new SyncScheduler(run, () => undefined), run };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SyncScheduler polling', () => {
  it('syncs once per configured interval', () => {
    const { scheduler, run } = schedulerWith();

    scheduler.restartPolling(5);
    jest.advanceTimersByTime(5 * ONE_MINUTE_MS);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('starts no poll at all when the interval is 0', () => {
    const { scheduler, run } = schedulerWith();

    scheduler.restartPolling(0);
    jest.advanceTimersByTime(24 * 60 * ONE_MINUTE_MS);

    expect(run).not.toHaveBeenCalled();
    expect(scheduler.syncsAutomatically).toBe(false);
  });

  it('stops the running poll when the interval is turned off', () => {
    const { scheduler, run } = schedulerWith();

    scheduler.restartPolling(1);
    scheduler.restartPolling(0);
    jest.advanceTimersByTime(24 * 60 * ONE_MINUTE_MS);

    expect(run).not.toHaveBeenCalled();
  });

  it('polls again once an interval is set back', () => {
    const { scheduler, run } = schedulerWith();

    scheduler.restartPolling(0);
    scheduler.restartPolling(1);
    jest.advanceTimersByTime(ONE_MINUTE_MS);

    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.syncsAutomatically).toBe(true);
  });
});

describe('SyncScheduler syncing after an edit', () => {
  it('syncs once the edits have settled', () => {
    const { scheduler, run } = schedulerWith();

    scheduler.restartPolling(5);
    scheduler.syncWhenTypingStops();
    jest.advanceTimersByTime(DEBOUNCE_GRACE_MS);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not sync after an edit while the interval is 0', () => {
    const { scheduler, run } = schedulerWith();

    scheduler.restartPolling(0);
    scheduler.syncWhenTypingStops();
    jest.advanceTimersByTime(DEBOUNCE_GRACE_MS);

    expect(run).not.toHaveBeenCalled();
  });

  it('drops an edit already waiting when the interval is turned off', () => {
    const { scheduler, run } = schedulerWith();

    scheduler.restartPolling(5);
    scheduler.syncWhenTypingStops();
    scheduler.restartPolling(0);
    jest.advanceTimersByTime(DEBOUNCE_GRACE_MS);

    expect(run).not.toHaveBeenCalled();
  });
});
