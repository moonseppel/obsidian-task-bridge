import { leadingWhitespace, levelsBelowTask } from './task-description';
import { parseTaskLine } from './task-line';

export interface SubtreeSpan {
  /** Always the line after the task line, even when the span is empty. */
  readonly startLine: number;
  readonly endLineExclusive: number;
}

interface OpenAncestor {
  readonly lineNumber: number;
  readonly taskLine: string;
}

/**
 * Every task line's nearest ancestor task line, found in one indentation-based walk of the
 * whole note. A line no deeper than an open ancestor closes it, the same level boundary
 * `readDescriptionBlock` uses, so the note has exactly one nesting rule rather than two.
 */
export function nearestAncestorLineNumbers(lines: readonly string[]): ReadonlyMap<number, number> {
  const parents = new Map<number, number>();
  const open: OpenAncestor[] = [];

  for (const [lineNumber, line] of lines.entries()) {
    closeAncestorsEndedBy(open, line);

    if (parseTaskLine(line) === undefined) {
      continue;
    }

    const parent = open[open.length - 1];

    if (parent !== undefined) {
      parents.set(lineNumber, parent.lineNumber);
    }

    open.push({ lineNumber, taskLine: line });
  }

  return parents;
}

/**
 * How far a task's own content reaches: its description and every nested descendant, at any
 * depth. Generalizes `readDescriptionBlock`'s capture rule by not stopping at the first nested
 * task line, since a subtree includes its children rather than treating them as a boundary.
 */
export function subtreeSpan(lines: readonly string[], taskLineNumber: number): SubtreeSpan {
  const taskLine = lines[taskLineNumber] ?? '';
  const startLine = taskLineNumber + 1;
  let lineNumber = startLine;

  while (lineNumber < lines.length && levelsBelowTask(lines[lineNumber], taskLine) >= 1) {
    lineNumber += 1;
  }

  return { startLine, endLineExclusive: lineNumber };
}

/**
 * Rebases a block of lines from one base indentation to another, preserving each line's depth
 * relative to that base — the same convention `renderDescriptionBlock` uses, generalized to a
 * block that may already carry its own indentation rather than starting bare.
 */
export function reindentBlock(lines: readonly string[], oldBaseIndent: string, newBaseIndent: string): string[] {
  return lines.map((line) => {
    const ownIndent = leadingWhitespace(line);
    const extra = ownIndent.slice(oldBaseIndent.length);

    return `${newBaseIndent}${extra}${line.slice(ownIndent.length)}`;
  });
}

function closeAncestorsEndedBy(open: OpenAncestor[], line: string): void {
  while (open.length > 0 && levelsBelowTask(line, open[open.length - 1].taskLine) <= 0) {
    open.pop();
  }
}
