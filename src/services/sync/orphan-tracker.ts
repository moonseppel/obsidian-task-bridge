import { isRecord } from '../../utils/type-guards';

/** A provider task that carries this plugin's block id but has no live link to it, and since when. */
export interface OrphanRecord {
  providerTaskId: string;
  firstSeenOrphanedAt: number;
}

/** Separate from TaskLinkStore, since an orphan by definition has no live link to keep it in. */
export class OrphanTracker {
  private readonly byTaskId: Map<string, OrphanRecord>;

  constructor(records: readonly OrphanRecord[] = []) {
    this.byTaskId = new Map(records.map((record): [string, OrphanRecord] => [record.providerTaskId, record]));
  }

  /** Anything malformed is dropped rather than trusted: a bad record would misdate a removal. */
  static fromStored(stored: unknown): OrphanTracker {
    return new OrphanTracker(toOrphanRecords(stored));
  }

  /** Keeps this instance, so whatever already holds it sees the records that were just loaded. */
  replaceAll(stored: unknown): void {
    this.byTaskId.clear();

    for (const record of toOrphanRecords(stored)) {
      this.byTaskId.set(record.providerTaskId, record);
    }
  }

  get(providerTaskId: string): OrphanRecord | undefined {
    return this.byTaskId.get(providerTaskId);
  }

  /** A task already tracked keeps the time it was first observed orphaned, rather than resetting it. */
  track(providerTaskId: string, observedAt: number): void {
    if (!this.byTaskId.has(providerTaskId)) {
      this.byTaskId.set(providerTaskId, { providerTaskId, firstSeenOrphanedAt: observedAt });
    }
  }

  /** Drops tracking for anything not given, since it's rebuilt from what's currently orphaned each pass. */
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
    typeof value.firstSeenOrphanedAt === 'number'
  );
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}
