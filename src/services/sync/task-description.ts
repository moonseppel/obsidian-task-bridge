import { parseTaskLine } from './task-line';

/** The label makes the caret-prefixed id legible to a user with no reason to know what an Obsidian block id is. */
const ID_LABEL = 'Obsidian Task Sync ID: ';

export interface DescriptionBlock {
  /** The line right after the task line, whether or not a block was actually found there. */
  readonly startLine: number;
  /** 0 when no description block was captured. */
  readonly lineCount: number;
  readonly text: string;
}

/** A task line's own indentation, e.g. to pass to renderDescriptionBlock when pulling a description. */
export function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

/** Any deeper whitespace counts, not just a literal tab, so the note is read the same regardless of what its indentation is made of. */
function isDeeperThan(line: string, taskIndent: string): boolean {
  const indent = leadingWhitespace(line);

  return indent.startsWith(taskIndent) && indent.length > taskIndent.length;
}

/** Strips exactly the smallest extra indent shared by every captured line, preserving any deeper relative indentation within the block itself. */
function dedent(rawLines: readonly string[], taskIndent: string): string {
  const minExtra = Math.min(...rawLines.map((line) => leadingWhitespace(line).length - taskIndent.length));

  return rawLines.map((line) => line.slice(taskIndent.length + minExtra)).join('\n');
}

/**
 * Captures the text indented at least one level deeper than a task line, stopping at the first
 * blank line, insufficiently indented line, or nested task line — a nested checkbox is already
 * synced independently as its own task, so it is never swallowed into the parent's description.
 */
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

/** The inverse of readDescriptionBlock's dedent: one literal tab past the task's own indentation, unambiguous regardless of tab width. */
export function renderDescriptionBlock(taskIndent: string, text: string): readonly string[] {
  if (text.length === 0) {
    return [];
  }

  return text.split('\n').map((line) => `${taskIndent}\t${line}`);
}

/**
 * What a task's description holds: the user's text, a blank line, then this plugin's identifying
 * footer — or, with no user text, just the bare footer, exactly as a freshly created task's
 * description has always looked.
 */
export function composeRemoteDescription(userText: string, blockId: string): string {
  const footer = `${ID_LABEL}^${blockId}`;

  return userText.length === 0 ? footer : `${userText}\n\n${footer}`;
}

/**
 * The footer is found by searching for its label, never by assuming it is the last line, since
 * the description may have been edited afterward (architecture-rules.md #8). The blank line
 * composeRemoteDescription inserts before it is stripped back out along with it.
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
