/** A list item whose marker is followed by a single-character checkbox, e.g. `- [ ] ` or `2. [x] `. */
const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])[ \t]+)\[(.)\][ \t]+(.*)$/;
/** Obsidian block identifiers allow letters, numbers and dashes, and are case-insensitive. */
const TRAILING_BLOCK_ID = /^(.*?)[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/;
const ANY_BLOCK_ID = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;
/** One or more trailing `#tag` tokens, recognized only where they run all the way to the end. */
const TRAILING_TAGS = /((?:[ \t]#[A-Za-z0-9_/-]+)+)[ \t]*$/;
const TAG_TOKEN = /#([A-Za-z0-9_/-]+)/g;
/** The same character set TAG_TOKEN accepts, checked against a whole string rather than found within one. */
const VALID_TAG = /^[A-Za-z0-9_/-]+$/;

export interface ParsedTaskLine {
  /** The list marker, kept verbatim so indentation survives. */
  readonly prefix: string;
  /** The single character inside the checkbox brackets, e.g. ' ' or 'x'. */
  readonly checkbox: string;
  readonly title: string;
  /** Stripped out of title, in the order they appeared, the same way the block id already is. */
  readonly tags: readonly string[];
  readonly blockId: string | undefined;
}

/**
 * Any checkbox character other than a plain space reads as done. A richer, user-defined state
 * (e.g. the Tasks plugin's `[/]` or `[-]`) is not given separate meaning here — see Feature 10.
 */
export function isDone(task: ParsedTaskLine): boolean {
  return task.checkbox !== ' ';
}

/**
 * Whether a string could be written as `#tag` at all — a Todoist label may contain a space or a
 * character Obsidian's tag syntax doesn't allow, in which case it is left unsynced rather than
 * mangled into something that wouldn't parse back the same way.
 */
export function isRepresentableAsTag(label: string): boolean {
  return VALID_TAG.test(label);
}

/**
 * A tag is recognized only where it trails the text, immediately before where the block id would
 * be; a `#tag` elsewhere in the text (e.g. mid-sentence) is left as ordinary text untouched.
 */
function splitTrailingTags(text: string): { rest: string; tags: string[] } {
  const match = TRAILING_TAGS.exec(text);

  if (match === null) {
    return { rest: text, tags: [] };
  }

  const tags = [...match[1].matchAll(TAG_TOKEN)].map((tagMatch) => tagMatch[1]);

  return { rest: text.slice(0, match.index), tags };
}

export function parseTaskLine(line: string): ParsedTaskLine | undefined {
  const match = TASK_LINE.exec(line);

  if (match === null) {
    return undefined;
  }

  const [, prefix, checkbox, remainder] = match;
  const withBlockId = TRAILING_BLOCK_ID.exec(remainder);
  const [beforeBlockId, blockId] = withBlockId === null ? [remainder, undefined] : [withBlockId[1], withBlockId[2]];
  const { rest, tags } = splitTrailingTags(beforeBlockId);

  return { prefix, checkbox, title: rest.trim(), tags, blockId };
}

export function formatTaskLine(task: ParsedTaskLine): string {
  const tagsSuffix = task.tags.map((tag) => ` #${tag}`).join('');
  const anchor = task.blockId === undefined ? '' : ` ^${task.blockId}`;

  return `${task.prefix}[${task.checkbox}] ${task.title}${tagsSuffix}${anchor}`;
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
