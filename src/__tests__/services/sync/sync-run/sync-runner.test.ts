import { StatusReporter } from '../../../../services/status-reporter';
import { emptyOutcome } from '../../../../services/sync/sync-run/sync-outcome';
import { SyncRunner } from '../../../../services/sync/sync-run/sync-runner';
import { Logger } from '../../../../utils/logger';

const NO_NOTES_IN_SCOPE =
  'No notes are in scope, so nothing is synced until a note, folder or the whole vault is chosen';

function runnerWhile(hasFilesInScope: () => boolean): SyncRunner {
  const logger = new Logger('test');

  return new SyncRunner({
    hasFilesInScope,
    sync: () => Promise.resolve({ ...emptyOutcome({ kind: 'configured' }), filesScanned: 1 }),
    adoptProject: () => Promise.resolve(),
    reporter: new StatusReporter(logger, () => undefined, { get: () => 0, set: () => undefined }),
    syncWhenTypingStops: () => undefined,
    logger,
  });
}

describe('SyncRunner while no notes are in scope', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('says so at info only the first time a sync is skipped for it', async () => {
    const info = jest.spyOn(Logger.prototype, 'info').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const runner = runnerWhile(() => false);

    await runner.run();
    await runner.run();

    expect(info.mock.calls.filter(([message]) => message === NO_NOTES_IN_SCOPE)).toHaveLength(1);
  });

  it('says so at info again once notes came into scope and left it', async () => {
    const info = jest.spyOn(Logger.prototype, 'info').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    let inScope = false;
    const runner = runnerWhile(() => inScope);

    await runner.run();
    inScope = true;
    await runner.run();
    inScope = false;
    await runner.run();

    expect(info.mock.calls.filter(([message]) => message === NO_NOTES_IN_SCOPE)).toHaveLength(2);
  });
});
