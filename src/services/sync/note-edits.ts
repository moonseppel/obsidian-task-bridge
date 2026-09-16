import { EditableLines } from './editable-lines';
import { DEFAULT_INDENTATION } from './indentation';

/** A line as the pass read it; an edit guarded by it only acts while the note still reads that way. */
export interface LineGuard {
  readonly lineNumber: number;
  readonly expected: string;
}

/** Replaces one line only if it still reads as it did when the pass started. */
export interface LineEdit extends LineGuard {
  readonly replacement: string;
}

/** Drops one line outright, only if it still reads as it did when the pass started. */
export type LineRemoval = LineGuard;

/**
 * Guarded by the anchoring task line rather than the block's own content, since the block may not
 * exist yet. startLine/lineCount span what is there now, in the pass's original line numbers.
 */
export interface BlockEdit {
  readonly taskLineNumber: number;
  readonly expectedTaskLine: string;
  readonly startLine: number;
  readonly lineCount: number;
  readonly replacementLines: readonly string[];
}

/**
 * Moves lines rather than rewriting them, so it is applied once every line's own text is final and
 * the lines carry those changes along. Guarded by the lines it anchors on, not the lines it moves.
 */
export type StructuralEdit =
  | { readonly kind: 'insert-under'; readonly anchor: LineGuard; readonly lines: readonly string[] }
  | { readonly kind: 'move-under'; readonly task: LineGuard; readonly newParent: LineGuard }
  | { readonly kind: 'reindent'; readonly task: LineGuard; readonly indent: string };

/** Everything one pass wants done to the note, applied together in the same atomic write. */
export interface NoteEdits {
  readonly replacements: readonly LineEdit[];
  readonly removals: readonly LineRemoval[];
  readonly blocks: readonly BlockEdit[];
  readonly structure: readonly StructuralEdit[];
  readonly appended: readonly string[];
}

export function hasAnyEdit(edits: NoteEdits): boolean {
  const { replacements, removals, blocks, structure, appended } = edits;

  return replacements.length + removals.length + blocks.length + structure.length + appended.length > 0;
}

export function appendingOnly(lines: readonly string[]): NoteEdits {
  return { replacements: [], removals: [], blocks: [], structure: [], appended: lines };
}

/**
 * Every edit finds its lines by where the pass read them, not by where they sit now. Each line's own
 * text is settled first and lines are moved after, so a moved line carries every change made to it
 * and edits touching the same lines compose instead of the last one silently undoing the others.
 */
export function applyNoteEdits(content: string, edits: NoteEdits, indentation = DEFAULT_INDENTATION): string {
  const original = content.split('\n');
  const stillReads = readsAsExpected(original);
  const lines = new EditableLines(original, indentation);

  edits.replacements.filter(stillReads).forEach((edit) => lines.replace(edit.lineNumber, edit.replacement));
  lines.removeAll(edits.removals.filter(stillReads).map((removal) => removal.lineNumber));
  edits.blocks.filter((block) => stillReads(anchorOf(block))).forEach((block) => replaceBlock(lines, block));
  edits.structure.filter((edit) => guardsOf(edit).every(stillReads)).forEach((edit) => applyStructure(lines, edit));

  return appendLines(lines.texts().join('\n'), edits.appended);
}

/** The edits applyNoteEdits leaves out because a line guarding them no longer reads as the pass saw it. */
export function countSkippedEdits(content: string, edits: NoteEdits): number {
  const stillReads = readsAsExpected(content.split('\n'));
  const lineGuards: LineGuard[] = [...edits.replacements, ...edits.removals, ...edits.blocks.map(anchorOf)];
  const skippedLineEdits = lineGuards.filter((guard) => !stillReads(guard)).length;

  return skippedLineEdits + edits.structure.filter((edit) => !guardsOf(edit).every(stillReads)).length;
}

function readsAsExpected(original: readonly string[]): (guard: LineGuard) => boolean {
  return (guard) => original[guard.lineNumber] === guard.expected;
}

function anchorOf(block: BlockEdit): LineGuard {
  return { lineNumber: block.taskLineNumber, expected: block.expectedTaskLine };
}

function replaceBlock(lines: EditableLines, block: BlockEdit): void {
  lines.removeAll(Array.from({ length: block.lineCount }, (_, offset) => block.startLine + offset));
  lines.insertAfter(block.taskLineNumber, block.replacementLines);
}

function guardsOf(edit: StructuralEdit): readonly LineGuard[] {
  switch (edit.kind) {
    case 'insert-under':
      return [edit.anchor];
    case 'move-under':
      return [edit.task, edit.newParent];
    case 'reindent':
      return [edit.task];
  }
}

function applyStructure(lines: EditableLines, edit: StructuralEdit): void {
  switch (edit.kind) {
    case 'insert-under':
      lines.insertUnder(edit.anchor.lineNumber, edit.lines);
      return;
    case 'move-under':
      lines.moveUnder(edit.task.lineNumber, edit.newParent.lineNumber);
      return;
    case 'reindent':
      lines.reindent(edit.task.lineNumber, edit.indent);
  }
}

function appendLines(content: string, lines: readonly string[]): string {
  if (lines.length === 0) {
    return content;
  }

  return content.length === 0 ? lines.join('\n') : [content, ...lines].join('\n');
}
