import { Logger } from '../../utils/logger';

const logger = new Logger('TaskBridge:Sync');

/**
 * Like `try { work } finally { commit }`, except that a commit failing after the work already failed
 * does not silently take the place of the work's error: it is logged here, and the work's error goes
 * on to be reported as the reason the sync stopped.
 */
export async function runThenCommit<T>(work: () => Promise<T>, commit: () => Promise<void>): Promise<T> {
  const result = await work().catch(async (workFailure: unknown) => {
    await commit().catch((commitFailure: unknown) => {
      logger.error('Saving what the failed sync had already done failed as well', commitFailure);
    });
    throw workFailure;
  });

  await commit();
  return result;
}
