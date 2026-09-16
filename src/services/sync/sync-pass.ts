import { ProviderTask } from '../task-provider';
import { BlockEdit, LineEdit, LineGuard, LineRemoval, NoteEdits, StructuralEdit } from './note-edits';
import { ResolvedProject } from './project-resolver';
import { SyncOutcome, emptyOutcome } from './sync-outcome';
import { indexTasksByEmbeddedBlockId, indexTasksById } from './task-index';
import { ParsedTaskLine, collectBlockIds, formatTaskLine, parseTaskLine } from './task-line';
import { TaskLink } from './task-links';
import { nearestAncestorLineNumbers, taskLineNumbers } from './task-tree';

/** A local task line whose remote parent was found to live in a different in-scope file. */
export interface PendingRelocation {
  readonly blockId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly newParentBlockId: string;
}

export interface SyncPass {
  readonly lines: readonly string[];
  readonly path: string;
  readonly projectId: string;
  readonly remoteTasks: ReadonlyMap<string, ProviderTask>;
  readonly remoteTasksByBlockId: ReadonlyMap<string, ProviderTask>;
  readonly takenBlockIds: Set<string>;
  readonly localModifiedAt: number;
  /** Each task line's nearest ancestor task line, fixed for the pass since it reads original content. */
  readonly parentLineNumbers: ReadonlyMap<number, number>;
  /** Which lines are tasks rather than description text, fixed for the pass like parentLineNumbers. */
  readonly taskLineNumbers: ReadonlySet<number>;
  /**
   * The block id each task line is using this pass, recorded as it becomes known so a child
   * processed later in the same top-down pass can resolve its parent's identity even when that
   * parent's block id was only just minted and hasn't been written into the note yet.
   */
  readonly blockIdByLineNumber: Map<number, string>;
  /** Every block id currently anchoring a task line in the note, fixed for the pass like parentLineNumbers. */
  readonly lineNumberByBlockId: ReadonlyMap<string, number>;
  /**
   * Each edited task line's latest form, so a field pulled after another builds on it rather than on
   * the line as the pass read it, which would silently undo the earlier pull.
   */
  readonly editedTasks: Map<number, ParsedTaskLine>;
  readonly removals: LineRemoval[];
  readonly blocks: BlockEdit[];
  readonly structure: StructuralEdit[];
  readonly appended: string[];
  /** A remote reparent onto a parent living in another in-scope file, queued for `CrossFileParentSync`. */
  readonly pendingParentRelocations: PendingRelocation[];
  readonly outcome: SyncOutcome;
}

export interface LineUnderSync {
  readonly pass: SyncPass;
  readonly lineNumber: number;
  readonly original: string;
  readonly task: ParsedTaskLine;
}

export interface LinkedLine {
  readonly line: LineUnderSync;
  readonly link: TaskLink;
}

/** What replaces the span right after an anchoring task line, in the pass's original line numbers. */
export interface BlockReplacement {
  readonly startLine: number;
  readonly lineCount: number;
  readonly lines: readonly string[];
}

export interface NoteSnapshot {
  readonly content: string;
  readonly modifiedAt: number;
}

export function createSyncPass(project: ResolvedProject, note: NoteSnapshot, path: string): SyncPass {
  const lines = note.content.split('\n');
  const taskLines = taskLineNumbers(lines);

  return {
    lines,
    path,
    projectId: project.id,
    remoteTasks: indexTasksById(project.tasks),
    remoteTasksByBlockId: indexTasksByEmbeddedBlockId(project.tasks),
    takenBlockIds: collectBlockIds(lines),
    localModifiedAt: note.modifiedAt,
    parentLineNumbers: nearestAncestorLineNumbers(lines),
    taskLineNumbers: taskLines,
    blockIdByLineNumber: new Map(),
    lineNumberByBlockId: lineNumberByBlockId(lines, taskLines),
    editedTasks: new Map(),
    removals: [],
    blocks: [],
    structure: [],
    appended: [],
    pendingParentRelocations: [],
    outcome: emptyOutcome(project.resolution),
  };
}

/**
 * Every block id anchoring a task line this run counts as found, plus every one minted this pass,
 * whose line may not be written yet. One carried only by description text is left out: its task
 * has no line. So is one whose line fails the tag filter — that line is out of scope exactly as if
 * it stood in no scanned note at all, which is what puts its task on the out-of-scope lifecycle.
 */
export function anchoredBlockIds(pass: SyncPass, isTagInScope: (task: ParsedTaskLine) => boolean): string[] {
  const inNote = collectBlockIds(pass.lines);

  return [...pass.takenBlockIds].filter((blockId) => {
    const lineNumber = pass.lineNumberByBlockId.get(blockId);

    return lineNumber === undefined ? !inNote.has(blockId) : anchorsLineInScope(pass, lineNumber, isTagInScope);
  });
}

export function collectedEdits(pass: SyncPass): NoteEdits {
  return {
    replacements: taskLineReplacements(pass),
    removals: pass.removals,
    blocks: pass.blocks,
    structure: pass.structure,
    appended: pass.appended,
  };
}

/** Revises whatever this pass already changed on the line, so every field pulled onto it lands. */
export function recordTaskEdit(line: LineUnderSync, revise: (task: ParsedTaskLine) => ParsedTaskLine): void {
  const { pass, lineNumber } = line;

  pass.editedTasks.set(lineNumber, revise(pass.editedTasks.get(lineNumber) ?? line.task));
}

export function recordRemoval(line: LineUnderSync): void {
  line.pass.removals.push(guardAt(line.pass, line.lineNumber));
}

export function recordBlockEdit(line: LineUnderSync, replacement: BlockReplacement): void {
  line.pass.blocks.push({
    taskLineNumber: line.lineNumber,
    expectedTaskLine: line.original,
    startLine: replacement.startLine,
    lineCount: replacement.lineCount,
    replacementLines: replacement.lines,
  });
}

/** Lands after everything nested under the anchor once the pass's other edits are in, whatever they added. */
export function recordInsertUnder(pass: SyncPass, anchorLineNumber: number, lines: readonly string[]): void {
  if (lines.length > 0) {
    pass.structure.push({ kind: 'insert-under', anchor: guardAt(pass, anchorLineNumber), lines });
  }
}

export function recordMoveUnder(line: LineUnderSync, newParentLineNumber: number): void {
  const { pass } = line;

  pass.structure.push({
    kind: 'move-under',
    task: guardAt(pass, line.lineNumber),
    newParent: guardAt(pass, newParentLineNumber),
  });
}

export function recordReindent(line: LineUnderSync, indent: string): void {
  line.pass.structure.push({ kind: 'reindent', task: guardAt(line.pass, line.lineNumber), indent });
}

/** Queues a relocation for `CrossFileParentSync` instead of touching this pass's own edits directly:
 *  the target file may not have been read yet, so nothing here is safe to apply until every file's
 *  own pass has committed its normal edits. */
export function recordPendingRelocation(line: LineUnderSync, newParentBlockId: string, targetPath: string): void {
  const { pass, task } = line;

  if (task.blockId === undefined) {
    return;
  }

  pass.pendingParentRelocations.push({
    blockId: task.blockId,
    sourcePath: pass.path,
    targetPath,
    newParentBlockId,
  });
}

/**
 * The block id of a line's nearest ancestor task line, or undefined for a top-level line or one
 * whose ancestor has no block id of its own yet (an empty-titled line, or one not synced at all).
 */
export function localParentBlockId(pass: SyncPass, lineNumber: number): string | undefined {
  const parentLineNumber = pass.parentLineNumbers.get(lineNumber);

  return parentLineNumber === undefined ? undefined : pass.blockIdByLineNumber.get(parentLineNumber);
}

function anchorsLineInScope(
  pass: SyncPass,
  lineNumber: number,
  isTagInScope: (task: ParsedTaskLine) => boolean,
): boolean {
  const task = parseTaskLine(pass.lines[lineNumber]);

  return task !== undefined && isTagInScope(task);
}

function taskLineReplacements(pass: SyncPass): LineEdit[] {
  return [...pass.editedTasks]
    .map(([lineNumber, task]) => ({ ...guardAt(pass, lineNumber), replacement: formatTaskLine(task) }))
    .filter((edit) => edit.replacement !== edit.expected);
}

function guardAt(pass: SyncPass, lineNumber: number): LineGuard {
  return { lineNumber, expected: pass.lines[lineNumber] };
}

function lineNumberByBlockId(lines: readonly string[], taskLines: ReadonlySet<number>): ReadonlyMap<string, number> {
  const found = new Map<string, number>();

  for (const lineNumber of taskLines) {
    const blockId = parseTaskLine(lines[lineNumber])?.blockId;

    if (blockId !== undefined) {
      found.set(blockId, lineNumber);
    }
  }

  return found;
}
