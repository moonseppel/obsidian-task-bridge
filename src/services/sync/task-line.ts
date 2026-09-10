/** A list item whose marker is followed by a single-character checkbox, e.g. `- [ ] ` or `2. [x] `. */
const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])[ \t]+\[.\][ \t]+)(.*)$/;
/** Obsidian block identifiers allow letters, numbers and dashes, and are case-insensitive. */
const TRAILING_BLOCK_ID = /^(.*?)[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/;
const ANY_BLOCK_ID = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;

export interface ParsedTaskLine {
  /** The list marker and checkbox, kept verbatim so indentation and checked state survive. */
  readonly prefix: string;
  readonly title: string;
  readonly blockId: string | null;
}

export function parseTaskLine(line: string): ParsedTaskLine | null {
  const match = TASK_LINE.exec(line);

  if (match === null) {
    return null;
  }

  const [, prefix, remainder] = match;
  const withBlockId = TRAILING_BLOCK_ID.exec(remainder);

  if (withBlockId === null) {
    return { prefix, title: remainder.trim(), blockId: null };
  }

  return { prefix, title: withBlockId[1].trim(), blockId: withBlockId[2] };
}

export function formatTaskLine(task: ParsedTaskLine): string {
  const anchor = task.blockId === null ? '' : ` ^${task.blockId}`;

  return `${task.prefix}${task.title}${anchor}`;
}

/** Every block id in the note, task line or not, so a newly minted one cannot collide. */
export function collectBlockIds(lines: readonly string[]): Set<string> {
  const found = new Set<string>();

  for (const line of lines) {
    const match = ANY_BLOCK_ID.exec(line);

    if (match !== null) {
      found.add(match[1]);
    }
  }

  return found;
}
