import { isDeeperThan, leadingWhitespace } from './task-description';
import { parseTaskLine } from './task-line';

export interface SubtreeSpan {
  /** Always the line after the task line, even when the span is empty. */
  readonly startLine: number;
  readonly endLineExclusive: number;
}

interface OpenAncestor {
  readonly lineNumber: number;
  readonly indent: string;
}

/**
 * Every task line's nearest ancestor task line, found in one indentation-based walk of the
 * whole note. A blank line closes every currently open ancestor, the same boundary
 * `readDescriptionBlock` already uses, so the note has exactly one nesting rule rather than two.
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

    open.push({ lineNumber, indent: leadingWhitespace(line) });
  }

  return parents;
}

/**
 * How far a task's own content reaches: its description and every nested descendant, at any
 * depth. Generalizes `readDescriptionBlock`'s capture rule by not stopping at the first nested
 * task line, since a subtree includes its children rather than treating them as a boundary.
 */
export function subtreeSpan(lines: readonly string[], taskLineNumber: number): SubtreeSpan {
  const taskIndent = leadingWhitespace(lines[taskLineNumber] ?? '');
  const startLine = taskLineNumber + 1;
  let lineNumber = startLine;

  while (
    lineNumber < lines.length &&
    lines[lineNumber].trim().length > 0 &&
    isDeeperThan(lines[lineNumber], taskIndent)
  ) {
    lineNumber += 1;
  }

  return { startLine, endLineExclusive: lineNumber };
}

/** A task line followed by every line of its subtree, in note order. */
export function subtreeLineNumbers(lines: readonly string[], taskLineNumber: number): number[] {
  const span = subtreeSpan(lines, taskLineNumber);

  return [taskLineNumber, ...range(span.startLine, span.endLineExclusive)];
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
  if (line.trim().length === 0) {
    open.length = 0;
    return;
  }

  while (open.length > 0 && !isDeeperThan(line, open[open.length - 1].indent)) {
    open.pop();
  }
}

function range(startInclusive: number, endExclusive: number): number[] {
  return Array.from({ length: endExclusive - startInclusive }, (_, index) => startInclusive + index);
}
