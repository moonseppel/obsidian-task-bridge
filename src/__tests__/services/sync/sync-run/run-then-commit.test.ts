import { runThenCommit } from '../../../../services/sync/sync-run/run-then-commit';
import { Logger } from '../../../../utils/logger';

describe('runThenCommit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('commits once the work succeeds', async () => {
    const commit = jest.fn().mockResolvedValue(undefined);

    await expect(runThenCommit(() => Promise.resolve('done'), commit)).resolves.toBe('done');
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('still commits when the work fails, then reports the work failure', async () => {
    const commit = jest.fn().mockResolvedValue(undefined);
    const workFailure = new Error('work failed');

    await expect(runThenCommit(() => Promise.reject(workFailure), commit)).rejects.toBe(workFailure);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('logs a commit that fails after the work failed, instead of losing the work failure', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const workFailure = new Error('work failed');
    const commitFailure = new Error('commit failed');

    const running = runThenCommit(() => Promise.reject(workFailure), () => Promise.reject(commitFailure));

    await expect(running).rejects.toBe(workFailure);
    expect(error).toHaveBeenCalledWith(expect.any(String), commitFailure);
  });

  it('reports a commit that fails after the work succeeded', async () => {
    const commitFailure = new Error('commit failed');

    const running = runThenCommit(() => Promise.resolve(), () => Promise.reject(commitFailure));

    await expect(running).rejects.toBe(commitFailure);
  });
});
