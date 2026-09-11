import { isRecord } from '../../utils/type-guards';

/** Ties one Obsidian block id to one provider task, plus the title both sides last agreed on. */
export interface TaskLink {
  blockId: string;
  providerTaskId: string;
  lastSyncedTitle: string;
}

export class TaskLinkStore {
  private readonly byBlockId: Map<string, TaskLink>;

  constructor(links: readonly TaskLink[] = []) {
    this.byBlockId = new Map(links.map((link): [string, TaskLink] => [link.blockId, link]));
  }

  /** Anything malformed is dropped rather than trusted: a bad link would duplicate a task. */
  static fromStored(stored: unknown): TaskLinkStore {
    return new TaskLinkStore(toTaskLinks(stored));
  }

  /** Keeps this instance, so whatever already holds it sees the links that were just loaded. */
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
    typeof value.lastSyncedTitle === 'string'
  );
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}
