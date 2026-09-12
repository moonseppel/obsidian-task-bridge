import { ProviderTask } from '../task-provider';
import { BlockEdit, LineEdit, LineRemoval, NoteEdits } from './note-edits';
import { ResolvedProject } from './project-resolver';
import { SyncOutcome, emptyOutcome } from './sync-outcome';
import { ParsedTaskLine, collectBlockIds, parseTaskLine } from './task-line';
import { nearestAncestorLineNumbers, subtreeSpan } from './task-tree';

export interface SyncPass {
  readonly lines: readonly string[];
  readonly projectId: string;
  readonly remoteTasks: ReadonlyMap<string, ProviderTask>;
  readonly remoteTasksByBlockId: ReadonlyMap<string, ProviderTask>;
  readonly takenBlockIds: Set<string>;
  readonly localModifiedAt: number;
  /** Each task line's nearest ancestor task line, fixed for the pass since it reads original content. */
  readonly parentLineNumbers: ReadonlyMap<number, number>;
  /**
   * The block id each task line is using this pass, recorded as it becomes known so a child
   * processed later in the same top-down pass can resolve its parent's identity even when that
   * parent's block id was only just minted and hasn't been written into the note yet.
   */
  readonly blockIdByLineNumber: Map<number, string>;
  /** Every block id currently anchoring a line in the note, fixed for the pass like parentLineNumbers. */
  readonly lineNumberByBlockId: ReadonlyMap<string, number>;
  /**
   * Lines queued to append after an anchor line's current existing content (its description and
   * whatever it already has nested under it), keyed by that anchor's line number. Multiple
   * unrelated pulls can target the same anchor in one pass — a new remote child and a relocated
   * task both landing under the same parent — so each accumulates here instead of racing to push
   * its own BlockEdit, which would let the last one silently win over the others.
   */
  readonly pendingAppends: Map<number, string[]>;
  readonly replacements: LineEdit[];
  readonly removals: LineRemoval[];
  readonly blocks: BlockEdit[];
  readonly appended: string[];
  readonly outcome: SyncOutcome;
}

export interface LineUnderSync {
  readonly pass: SyncPass;
  readonly lineNumber: number;
  readonly original: string;
  readonly task: ParsedTaskLine;
}

export function createSyncPass(project: ResolvedProject, note: NoteSnapshot): SyncPass {
  const lines = note.content.split('\n');

  return {
    lines,
    projectId: project.id,
    remoteTasks: byTaskId(project.tasks),
    remoteTasksByBlockId: byEmbeddedBlockId(project.tasks),
    takenBlockIds: collectBlockIds(lines),
    localModifiedAt: note.modifiedAt,
    parentLineNumbers: nearestAncestorLineNumbers(lines),
    blockIdByLineNumber: new Map(),
    lineNumberByBlockId: lineNumberByBlockId(lines),
    pendingAppends: new Map(),
    replacements: [],
    removals: [],
    blocks: [],
    appended: [],
    outcome: emptyOutcome(project.resolution),
  };
}

export interface NoteSnapshot {
  readonly content: string;
  readonly modifiedAt: number;
}

export function collectedEdits(pass: SyncPass): NoteEdits {
  return {
    replacements: pass.replacements,
    removals: pass.removals,
    blocks: pass.blocks,
    appended: pass.appended,
  };
}

export function recordEdit(line: LineUnderSync, replacement: string): void {
  if (replacement === line.original) {
    return;
  }

  line.pass.replacements.push({ lineNumber: line.lineNumber, expected: line.original, replacement });
}

/**
 * The block id of a line's nearest ancestor task line, or undefined for a top-level line or one
 * whose ancestor has no block id of its own yet (an empty-titled line, or one not synced at all).
 */
export function localParentBlockId(pass: SyncPass, lineNumber: number): string | undefined {
  const parentLineNumber = pass.parentLineNumbers.get(lineNumber);

  return parentLineNumber === undefined ? undefined : pass.blockIdByLineNumber.get(parentLineNumber);
}

export function recordRemoval(line: LineUnderSync): void {
  line.pass.removals.push({ lineNumber: line.lineNumber, expected: line.original });
}

/** Queues lines to land after an anchor's existing content; see pendingAppends for why this is batched. */
export function appendAfter(pass: SyncPass, anchorLineNumber: number, lines: readonly string[]): void {
  if (lines.length === 0) {
    return;
  }

  const existing = pass.pendingAppends.get(anchorLineNumber) ?? [];
  existing.push(...lines);
  pass.pendingAppends.set(anchorLineNumber, existing);
}

/** Turns every anchor's accumulated appends into exactly one BlockEdit, called once the pass is done queuing. */
export function flushPendingAppends(pass: SyncPass): void {
  for (const [anchorLineNumber, appended] of pass.pendingAppends) {
    const span = subtreeSpan(pass.lines, anchorLineNumber);

    pass.blocks.push({
      taskLineNumber: anchorLineNumber,
      expectedTaskLine: pass.lines[anchorLineNumber],
      startLine: span.startLine,
      lineCount: span.endLineExclusive - span.startLine,
      replacementLines: [...pass.lines.slice(span.startLine, span.endLineExclusive), ...appended],
    });
  }
}

function lineNumberByBlockId(lines: readonly string[]): ReadonlyMap<string, number> {
  const found = new Map<string, number>();

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const blockId = parseTaskLine(lines[lineNumber])?.blockId;

    if (blockId !== null && blockId !== undefined) {
      found.set(blockId, lineNumber);
    }
  }

  return found;
}

function byTaskId(tasks: readonly ProviderTask[]): Map<string, ProviderTask> {
  return new Map(tasks.map((task): [string, ProviderTask] => [task.id, task]));
}

function byEmbeddedBlockId(tasks: readonly ProviderTask[]): Map<string, ProviderTask> {
  const found = new Map<string, ProviderTask>();

  for (const task of tasks) {
    if (task.embeddedBlockId !== undefined) {
      found.set(task.embeddedBlockId, task);
    }
  }

  return found;
}
