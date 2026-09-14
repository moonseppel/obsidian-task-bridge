import { Logger } from '../../utils/logger';
import { TaskProviderError, failureReasonOf, isTransientFailure } from '../task-provider-error';
import { TaskLinkStore } from './task-links';

const logger = new Logger('TaskBridge:Sync');

/**
 * Reports a note's sync failure without stopping the run it happened in: the reason is logged once
 * and quietly repeated at debug from then on, so a note that fails on every poll doesn't fill the
 * console. Every task already linked in that note is kept counted as in scope, so a processing
 * failure never costs a task its scope on its own — a note failing partway through syncing its
 * lines already keeps every block id its content carries via `TaskSync`'s own commit step; this
 * only matters when the note could not even be read.
 */
export class NoteFailureReporter {
  private readonly links: TaskLinkStore;
  private readonly reasonsByPath = new Map<string, string>();

  constructor(links: TaskLinkStore) {
    this.links = links;
  }

  report(path: string, error: unknown, scannedBlockIds: Set<string>): void {
    for (const blockId of this.links.blockIdsIn(path)) {
      scannedBlockIds.add(blockId);
    }

    const reason = failureReasonOf(error);

    if (reason === this.reasonsByPath.get(path)) {
      logger.debug('Note failed to sync again for the same reason', { path });
      return;
    }

    this.reasonsByPath.set(path, reason);

    if (error instanceof TaskProviderError && isTransientFailure(error.failure)) {
      logger.warn(`Note failed to sync, but it retries on its own: ${path}`, error);
      return;
    }

    logger.error(`Note failed to sync: ${path}`, error);
  }

  /** Called once a note that previously failed succeeds again, so a later failure logs afresh. */
  clear(path: string): void {
    this.reasonsByPath.delete(path);
  }
}
