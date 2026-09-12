import { parseTaskLine } from './task-line';

/** Labelled so the caret-prefixed id means something to a user reading the task in the provider. */
const ID_LABEL = 'Obsidian Task Sync ID: ';

export interface DescriptionBlock {
  /** Always the line after the task line, even when lineCount is 0 and no block was found. */
  readonly startLine: number;
  readonly lineCount: number;
  readonly text: string;
}

export function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

/** Any deeper whitespace counts, not just a tab, so indentation style never changes what is read. */
export function isDeeperThan(line: string, taskIndent: string): boolean {
  const indent = leadingWhitespace(line);

  return indent.startsWith(taskIndent) && indent.length > taskIndent.length;
}

/** Strips only the shared extra indent, so relative indentation inside the block survives. */
function dedent(rawLines: readonly string[], taskIndent: string): string {
  const minExtra = Math.min(...rawLines.map((line) => leadingWhitespace(line).length - taskIndent.length));

  return rawLines.map((line) => line.slice(taskIndent.length + minExtra)).join('\n');
}

/** A nested checkbox stops the block: it syncs as its own task rather than as the parent's text. */
export function readDescriptionBlock(lines: readonly string[], taskLineNumber: number): DescriptionBlock {
  const taskIndent = leadingWhitespace(lines[taskLineNumber] ?? '');
  const startLine = taskLineNumber + 1;
  const captured: string[] = [];
  let lineNumber = startLine;

  while (
    lineNumber < lines.length &&
    lines[lineNumber].trim().length > 0 &&
    isDeeperThan(lines[lineNumber], taskIndent) &&
    parseTaskLine(lines[lineNumber]) === null
  ) {
    captured.push(lines[lineNumber]);
    lineNumber += 1;
  }

  if (captured.length === 0) {
    return { startLine, lineCount: 0, text: '' };
  }

  return { startLine, lineCount: captured.length, text: dedent(captured, taskIndent) };
}

/** One literal tab past the task's own indentation, so the depth is unambiguous at any tab width. */
export function renderDescriptionBlock(taskIndent: string, text: string): readonly string[] {
  if (text.length === 0) {
    return [];
  }

  return text.split('\n').map((line) => `${taskIndent}\t${line}`);
}

export function composeRemoteDescription(userText: string, blockId: string): string {
  const footer = `${ID_LABEL}^${blockId}`;

  return userText.length === 0 ? footer : `${userText}\n\n${footer}`;
}

/**
 * The footer is searched for, never assumed to be last: the user may have edited the description
 * after the plugin wrote it (architecture-rules.md #8).
 */
export function extractUserDescription(rawDescription: string): string {
  const lines = rawDescription.split('\n');
  const footerIndex = lines.findIndex((line) => line.includes(ID_LABEL));

  if (footerIndex === -1) {
    return rawDescription;
  }

  const before = lines.slice(0, footerIndex);
  const withoutBlankLine = before.length > 0 && before[before.length - 1] === '' ? before.slice(0, -1) : before;

  return withoutBlankLine.join('\n');
}
