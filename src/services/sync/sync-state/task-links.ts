import { isNonEmptyString, isRecord, isStringArray } from '../../../utils/type-guards';
import { warnAboutUnreadableEntries } from '../../../utils/unreadable-entries';

/**
 * Ties one Obsidian block id to one provider task, plus what both sides last agreed on for each
 * synced field. Fields added after a link may already exist are optional, both because a link
 * loaded from an older data.json never had them and because "unknown" is itself a safe default:
 * it just means the next pass treats that field as freshly changed on whichever side set it.
 */
export interface TaskLink {
  blockId: string;
  providerTaskId: string;
  lastSyncedTitle: string;
  lastSyncedDone?: boolean;
  lastSyncedDescription?: string;
  lastSyncedTags?: readonly string[];
  /** The block id of the parent task both sides last agreed on, or undefined for top-level. */
  lastSyncedParentBlockId?: string;
  /** The path of the file this block id was last found anchored in, across any pass. */
  lastKnownFilePath?: string;
}

/** Both ids of a linked parent, or neither while the parent is not linked yet. */
export interface LinkedParent {
  readonly blockId?: string;
  readonly providerTaskId?: string;
}

/** How a task is named in the debug log: by its ids alone, never by anything the task says. */
export interface LinkIds {
  readonly blockId: string;
  readonly taskId: string;
}

export class TaskLinkStore {
  private readonly byBlockId: Map<string, TaskLink>;

  constructor(links: readonly TaskLink[] = []) {
    this.byBlockId = new Map(links.map((link): [string, TaskLink] => [link.blockId, link]));
  }

  /**
   * Keeps this instance, so whatever already holds it sees the links that were just loaded.
   * Anything malformed is dropped rather than trusted: a bad link would duplicate a task.
   */
  replaceAll(stored: unknown): void {
    const links = toTaskLinks(stored);

    warnAboutUnreadableEntries('task links', stored, links.length);
    this.byBlockId.clear();

    for (const link of links) {
      this.byBlockId.set(link.blockId, link);
    }
  }

  get(blockId: string): TaskLink | undefined {
    return this.byBlockId.get(blockId);
  }

  set(link: TaskLink): void {
    this.byBlockId.set(link.blockId, link);
  }

  delete(blockId: string): void {
    this.byBlockId.delete(blockId);
  }

  /** A parent that is not linked yet counts as none, so its child is top-level until it is. */
  linkedParent(blockId: string | undefined): LinkedParent {
    const link = blockId === undefined ? undefined : this.byBlockId.get(blockId);

    return link === undefined ? {} : { blockId: link.blockId, providerTaskId: link.providerTaskId };
  }

  values(): IterableIterator<TaskLink> {
    return this.byBlockId.values();
  }

  get size(): number {
    return this.byBlockId.size;
  }

  /** Every block id a currently stored link says lives in the given file. */
  blockIdsIn(path: string): string[] {
    return [...this.byBlockId.values()]
      .filter((link) => link.lastKnownFilePath === path)
      .map((link) => link.blockId);
  }

  toStored(): TaskLink[] {
    return [...this.byBlockId.values()];
  }
}

export function linkIds(link: TaskLink): LinkIds {
  return { blockId: link.blockId, taskId: link.providerTaskId };
}

function toTaskLinks(stored: unknown): TaskLink[] {
  return Array.isArray(stored) ? stored.filter(isTaskLink) : [];
}

function isTaskLink(value: unknown): value is TaskLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.blockId) &&
    isNonEmptyString(value.providerTaskId) &&
    typeof value.lastSyncedTitle === 'string' &&
    (value.lastSyncedDone === undefined || typeof value.lastSyncedDone === 'boolean') &&
    (value.lastSyncedDescription === undefined || typeof value.lastSyncedDescription === 'string') &&
    (value.lastSyncedTags === undefined || isStringArray(value.lastSyncedTags)) &&
    (value.lastSyncedParentBlockId === undefined || isNonEmptyString(value.lastSyncedParentBlockId)) &&
    (value.lastKnownFilePath === undefined || isNonEmptyString(value.lastKnownFilePath))
  );
}
