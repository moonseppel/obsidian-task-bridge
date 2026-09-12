import { LineUnderSync } from './sync-pass';

/**
 * Every field is compared this same way and against its own last-agreed value, so a real conflict
 * on one field is told apart from a one-sided change and from a change to a different field.
 */
export interface FieldChange<T> {
  readonly local: T;
  readonly remote: T;
  readonly lastSynced: T;
  readonly remoteUpdatedAt: number | undefined;
  /** Only where a field's identity is not plain equality, such as tags comparing as a set. */
  readonly equals?: (left: T, right: T) => boolean;
  /** Both sides already agree, so neither is written; only the last-agreed value moves on. */
  settle(): void;
  push(): Promise<void>;
  pull(): void;
}

export async function syncField<T>(line: LineUnderSync, change: FieldChange<T>): Promise<void> {
  const equals = change.equals ?? identical;
  const localChanged = !equals(change.local, change.lastSynced);
  const remoteChanged = !equals(change.remote, change.lastSynced);

  if (localChanged && remoteChanged) {
    await resolveConflict(line, change, equals);
    return;
  }

  if (localChanged) {
    await change.push();
    return;
  }

  if (remoteChanged) {
    change.pull();
  }
}

/**
 * Both sides landing on the same value independently is not a conflict, just a silent settle.
 * Otherwise the newer side wins; when recency can't be told — the remote timestamp is missing, or
 * the two are exactly equal — the local edit wins, deterministically, so the outcome never flaps
 * from one pass to the next.
 */
async function resolveConflict<T>(
  line: LineUnderSync,
  change: FieldChange<T>,
  equals: (left: T, right: T) => boolean,
): Promise<void> {
  if (equals(change.local, change.remote)) {
    change.settle();
    return;
  }

  line.pass.outcome.conflicted += 1;

  if (change.remoteUpdatedAt !== undefined && change.remoteUpdatedAt > line.pass.localModifiedAt) {
    change.pull();
    return;
  }

  await change.push();
}

function identical<T>(left: T, right: T): boolean {
  return left === right;
}
