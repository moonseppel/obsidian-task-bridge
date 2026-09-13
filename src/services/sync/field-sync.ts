import { Logger } from '../../utils/logger';
import { LineUnderSync } from './sync-pass';

const logger = new Logger('ObsidianTaskSync:Sync');

export type SyncedField = 'title' | 'completion' | 'description' | 'tags' | 'parent';

/**
 * Every field is compared this same way and against its own last-agreed value, so a real conflict
 * on one field is told apart from a one-sided change and from a change to a different field.
 */
export interface FieldChange<T> {
  /** Names the field in the debug log, which never records its value: that is the user's own text. */
  readonly field: SyncedField;
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

interface FieldDecision {
  readonly field: SyncedField;
  readonly blockId: string | undefined;
}

interface ConflictDecision extends FieldDecision {
  readonly remoteUpdatedAt: number | undefined;
  readonly localModifiedAt: number;
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
    logger.debug('Pushing a local change', decisionOf(line, change));
    await change.push();
    return;
  }

  if (remoteChanged) {
    logger.debug('Pulling a remote change', decisionOf(line, change));
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
    logger.debug('Both sides made the same change; settling', decisionOf(line, change));
    change.settle();
    return;
  }

  line.pass.outcome.conflicted += 1;

  if (change.remoteUpdatedAt !== undefined && change.remoteUpdatedAt > line.pass.localModifiedAt) {
    logger.debug('Conflict won by the newer remote change; pulling', conflictOf(line, change));
    change.pull();
    return;
  }

  logger.debug('Conflict won by the local change; pushing', conflictOf(line, change));
  await change.push();
}

function decisionOf<T>(line: LineUnderSync, change: FieldChange<T>): FieldDecision {
  return { field: change.field, blockId: line.task.blockId };
}

function conflictOf<T>(line: LineUnderSync, change: FieldChange<T>): ConflictDecision {
  return {
    ...decisionOf(line, change),
    remoteUpdatedAt: change.remoteUpdatedAt,
    localModifiedAt: line.pass.localModifiedAt,
  };
}

function identical<T>(left: T, right: T): boolean {
  return left === right;
}
