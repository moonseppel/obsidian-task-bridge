import { DEFAULT_INDENTATION, Indentation } from './indentation';
import { isNestedTaskLine, leadingWhitespace } from './task-description';
import { parseTaskLine } from './task-line';

export interface SubtreeSpan {
  /** Always the line after the task line, even when the span is empty. */
  readonly startLine: number;
  readonly endLineExclusive: number;
}

interface OpenAncestor {
  readonly lineNumber: number;
  readonly taskLine: string;
  /** Until a nested task ends it, any other checkbox line below the ancestor is its description text. */
  descriptionOpen: boolean;
}

/**
 * Which lines are tasks, found in one top-down walk: a checkbox line is a task unless it lies inside
 * a still-open description, which only a nested task ends (architecture-rules.md #37).
 */
export function taskLineNumbers(lines: readonly string[], indentation = DEFAULT_INDENTATION): ReadonlySet<number> {
  const found = new Set<number>();

  walkTaskLines(lines, indentation, (lineNumber) => found.add(lineNumber));

  return found;
}

/**
 * Every task line's nearest ancestor task line, found in the same walk as `taskLineNumbers`. A line
 * no deeper than an open ancestor closes it, the same level boundary `readDescriptionBlock` uses,
 * so the note has exactly one nesting rule rather than two.
 */
export function nearestAncestorLineNumbers(
  lines: readonly string[],
  indentation = DEFAULT_INDENTATION,
): ReadonlyMap<number, number> {
  const parents = new Map<number, number>();

  walkTaskLines(lines, indentation, (lineNumber, parentLineNumber) => {
    if (parentLineNumber !== undefined) {
      parents.set(lineNumber, parentLineNumber);
    }
  });

  return parents;
}

/**
 * How far a task's own content reaches: its description and every nested descendant, at any
 * depth. Generalizes `readDescriptionBlock`'s capture rule by not stopping at the first nested
 * task line, since a subtree includes its children rather than treating them as a boundary.
 */
export function subtreeSpan(
  lines: readonly string[],
  taskLineNumber: number,
  indentation = DEFAULT_INDENTATION,
): SubtreeSpan {
  const taskLine = lines[taskLineNumber] ?? '';
  const startLine = taskLineNumber + 1;
  let lineNumber = startLine;

  while (lineNumber < lines.length && indentation.levelsBelow(lines[lineNumber], taskLine) >= 1) {
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

function walkTaskLines(
  lines: readonly string[],
  indentation: Indentation,
  visit: (lineNumber: number, parentLineNumber: number | undefined) => void,
): void {
  const open: OpenAncestor[] = [];

  for (const [lineNumber, line] of lines.entries()) {
    closeAncestorsEndedBy(open, line, indentation);

    const parent = open[open.length - 1];

    if (parseTaskLine(line) === undefined || isDescriptionText(line, parent, indentation)) {
      continue;
    }

    if (parent !== undefined) {
      parent.descriptionOpen = false;
    }

    visit(lineNumber, parent?.lineNumber);
    open.push({ lineNumber, taskLine: line, descriptionOpen: true });
  }
}

function isDescriptionText(
  checkboxLine: string,
  parent: OpenAncestor | undefined,
  indentation: Indentation,
): boolean {
  return (
    parent !== undefined && parent.descriptionOpen && !isNestedTaskLine(checkboxLine, parent.taskLine, indentation)
  );
}

function closeAncestorsEndedBy(open: OpenAncestor[], line: string, indentation: Indentation): void {
  while (open.length > 0 && indentation.levelsBelow(line, open[open.length - 1].taskLine) <= 0) {
    open.pop();
  }
}
