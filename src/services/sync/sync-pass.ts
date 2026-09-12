import { ProviderTask } from '../task-provider';
import { BlockEdit, LineEdit, LineRemoval, NoteEdits } from './note-edits';
import { ResolvedProject } from './project-resolver';
import { SyncOutcome, emptyOutcome } from './sync-outcome';
import { ParsedTaskLine, collectBlockIds } from './task-line';
import { nearestAncestorLineNumbers } from './task-tree';

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
