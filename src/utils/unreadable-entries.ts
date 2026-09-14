import { Logger } from './logger';

const logger = new Logger('TaskBridge:Data');

/**
 * Warns when entries of a list read back from `data.json` had to be dropped. Nothing stored yet is
 * no problem at all; a stored value that is not a list counts as one unreadable entry.
 */
export function warnAboutUnreadableEntries(listName: string, stored: unknown, readableCount: number): void {
  const unreadable = countUnreadable(stored, readableCount);

  if (unreadable > 0) {
    logger.warn(`Dropped unreadable ${listName} from the plugin data`, { unreadable });
  }
}

function countUnreadable(stored: unknown, readableCount: number): number {
  if (stored === undefined || stored === null) {
    return 0;
  }

  return Array.isArray(stored) ? stored.length - readableCount : 1;
}
