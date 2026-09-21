import { DEFAULT_INDENTATION, Indentation } from './indentation';
import { parseTaskLine } from './task-line';

export interface DescriptionBlock {
  /** Always the line after the task line, even when lineCount is 0 and no block was found. */
  readonly startLine: number;
  readonly lineCount: number;
  readonly text: string;
}

export function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

/** The one checkbox line below a task that is its nested task rather than its description text. */
export function isNestedTaskLine(line: string, taskLine: string, indentation = DEFAULT_INDENTATION): boolean {
  return (
    parseTaskLine(line) !== undefined &&
    indentation.levelsBelow(line, taskLine) === 1 &&
    indentation.leftoverSpaces(line) === 0
  );
}

/**
 * Exactly one level past the task's own, so deeper indentation inside the block survives. Levels
 * are removed, never characters: a level may be a tab or a whole run of spaces, and the spaces
 * left over after it belong to the line's own text.
 */
function dedent(rawLines: readonly string[], taskLine: string, indentation: Indentation): string {
  const removedLevels = indentation.levelOf(taskLine) + 1;

  return rawLines.map((line) => indentation.removeLevels(line, removedLevels)).join('\n');
}

/**
 * Ends for good at the first line no deeper than the task, or at its nested task; any other
 * checkbox line before that is text, never a task of its own (architecture-rules.md #37).
 */
export function readDescriptionBlock(
  lines: readonly string[],
  taskLineNumber: number,
  indentation = DEFAULT_INDENTATION,
): DescriptionBlock {
  const taskLine = lines[taskLineNumber] ?? '';
  const startLine = taskLineNumber + 1;
  const captured: string[] = [];
  let lineNumber = startLine;

  while (
    lineNumber < lines.length &&
    indentation.levelsBelow(lines[lineNumber], taskLine) >= 1 &&
    !isNestedTaskLine(lines[lineNumber], taskLine, indentation)
  ) {
    captured.push(lines[lineNumber]);
    lineNumber += 1;
  }

  if (captured.length === 0) {
    return { startLine, lineCount: 0, text: '' };
  }

  return { startLine, lineCount: captured.length, text: dedent(captured, taskLine, indentation) };
}

/** One literal tab past the task's own indentation, so the depth is unambiguous at any tab width. */
export function renderDescriptionBlock(taskIndent: string, text: string): readonly string[] {
  if (text.length === 0) {
    return [];
  }

  return text.split('\n').map((line) => `${taskIndent}\t${line}`);
}
