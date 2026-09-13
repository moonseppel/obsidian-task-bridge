import { isNonEmptyString, isRecord } from '../../utils/type-guards';

/** A provider task carrying this plugin's block id but no live link back to it. */
export interface OrphanRecord {
  providerTaskId: string;
  firstSeenOrphanedAt: number;
  /** Set once flagged. The date in the task's description is a courtesy copy; this one decides. */
  removalDueAt?: number;
}

/** Separate from TaskLinkStore, since an orphan by definition has no live link to keep it in. */
export class OrphanTracker {
  private readonly byTaskId: Map<string, OrphanRecord>;

  constructor(records: readonly OrphanRecord[] = []) {
    this.byTaskId = new Map(records.map((record): [string, OrphanRecord] => [record.providerTaskId, record]));
  }

  /**
   * Keeps this instance, so whatever already holds it sees the records that were just loaded.
   * Anything malformed is dropped rather than trusted: a bad record would misdate a removal.
   */
  replaceAll(stored: unknown): void {
    this.byTaskId.clear();

    for (const record of toOrphanRecords(stored)) {
      this.byTaskId.set(record.providerTaskId, record);
    }
  }

  get(providerTaskId: string): OrphanRecord | undefined {
    return this.byTaskId.get(providerTaskId);
  }

  track(providerTaskId: string, observedAt: number): void {
    if (!this.byTaskId.has(providerTaskId)) {
      this.byTaskId.set(providerTaskId, { providerTaskId, firstSeenOrphanedAt: observedAt });
    }
  }

  flag(providerTaskId: string, removalDueAt: number): void {
    const record = this.byTaskId.get(providerTaskId);

    if (record !== undefined) {
      this.byTaskId.set(providerTaskId, { ...record, removalDueAt });
    }
  }

  /** Tracking is rebuilt from whatever is currently orphaned, so anything absent is dropped. */
  keepOnly(stillOrphaned: ReadonlySet<string>): void {
    for (const providerTaskId of this.byTaskId.keys()) {
      if (!stillOrphaned.has(providerTaskId)) {
        this.byTaskId.delete(providerTaskId);
      }
    }
  }

  get size(): number {
    return this.byTaskId.size;
  }

  toStored(): OrphanRecord[] {
    return [...this.byTaskId.values()];
  }
}

function toOrphanRecords(stored: unknown): OrphanRecord[] {
  return Array.isArray(stored) ? stored.filter(isOrphanRecord) : [];
}

function isOrphanRecord(value: unknown): value is OrphanRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.providerTaskId) &&
    typeof value.firstSeenOrphanedAt === 'number' &&
    (value.removalDueAt === undefined || typeof value.removalDueAt === 'number')
  );
}
