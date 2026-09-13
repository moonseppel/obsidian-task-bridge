/** Replaces one line only if it still reads as it did when the pass started. */
export interface LineEdit {
  readonly lineNumber: number;
  readonly expected: string;
  readonly replacement: string;
}

/** Drops one line outright, only if it still reads as it did when the pass started. */
export interface LineRemoval {
  readonly lineNumber: number;
  readonly expected: string;
}

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

/** The edits still valid against the note as it reads now, indexed by the original line each acts on. */
interface ValidEdits {
  readonly replacementByLine: ReadonlyMap<number, string>;
  /** Removed outright, or covered by a block that replaces them. */
  readonly droppedLines: ReadonlySet<number>;
  readonly blockByAnchor: ReadonlyMap<number, BlockEdit>;
}

/** Everything one pass wants done to the note, applied together in the same atomic write. */
export interface NoteEdits {
  readonly replacements: readonly LineEdit[];
  readonly removals: readonly LineRemoval[];
  readonly blocks: readonly BlockEdit[];
  readonly appended: readonly string[];
}

export function hasAnyEdit(edits: NoteEdits): boolean {
  return edits.replacements.length + edits.removals.length + edits.blocks.length + edits.appended.length > 0;
}

export function appendingOnly(lines: readonly string[]): NoteEdits {
  return { replacements: [], removals: [], blocks: [], appended: lines };
}

export function applyNoteEdits(content: string, edits: NoteEdits): string {
  return appendLines(applyStructuralEdits(content, edits), edits.appended);
}

/**
 * Replacements, removals and block insertions are all resolved against the same original line
 * numbers in a single pass, rather than composed sequentially, since a block growing or shrinking
 * the note would otherwise shift every later edit's target out from under it.
 */
function applyStructuralEdits(content: string, edits: NoteEdits): string {
  const lines = content.split('\n');
  const valid = validEditsFor(lines, edits);
  const result: string[] = [];

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    if (valid.droppedLines.has(lineNumber)) {
      continue;
    }

    result.push(valid.replacementByLine.get(lineNumber) ?? lines[lineNumber]);
    result.push(...(valid.blockByAnchor.get(lineNumber)?.replacementLines ?? []));
  }

  return result.join('\n');
}

/** Only an edit whose guard line still reads as it did when the pass started is kept. */
function validEditsFor(lines: readonly string[], edits: NoteEdits): ValidEdits {
  const replacements = edits.replacements.filter((edit) => lines[edit.lineNumber] === edit.expected);
  const removals = edits.removals.filter((removal) => lines[removal.lineNumber] === removal.expected);
  const blocks = edits.blocks.filter((block) => lines[block.taskLineNumber] === block.expectedTaskLine);

  return {
    replacementByLine: new Map(replacements.map((edit): [number, string] => [edit.lineNumber, edit.replacement])),
    droppedLines: new Set([...removals.map((removal) => removal.lineNumber), ...blocks.flatMap(spannedLineNumbers)]),
    blockByAnchor: new Map(blocks.map((block): [number, BlockEdit] => [block.taskLineNumber, block])),
  };
}

function spannedLineNumbers(block: BlockEdit): number[] {
  return Array.from({ length: block.lineCount }, (_, offset) => block.startLine + offset);
}

function appendLines(content: string, lines: readonly string[]): string {
  if (lines.length === 0) {
    return content;
  }

  return content.length === 0 ? lines.join('\n') : [content, ...lines].join('\n');
}
