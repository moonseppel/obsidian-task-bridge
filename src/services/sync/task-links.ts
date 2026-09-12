import { isRecord } from '../../utils/type-guards';

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
    this.byBlockId.clear();

    for (const link of toTaskLinks(stored)) {
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

  values(): IterableIterator<TaskLink> {
    return this.byBlockId.values();
  }

  get size(): number {
    return this.byBlockId.size;
  }

  toStored(): TaskLink[] {
    return [...this.byBlockId.values()];
  }
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
    (value.lastSyncedTags === undefined || isStringArray(value.lastSyncedTags))
  );
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
