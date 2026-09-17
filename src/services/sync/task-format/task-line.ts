/** A list item whose marker is followed by a single-character checkbox, e.g. `- [ ] ` or `2. [x] `. */
const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])[ \t]+)\[(.)\][ \t]+(.*)$/;
/** Obsidian block identifiers allow letters, numbers and dashes, and are case-insensitive. */
const TRAILING_BLOCK_ID = /^(.*?)[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/;
const ANY_BLOCK_ID = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;
/**
 * What a `#tag`'s body is built from, as Obsidian reads it: a letter or a digit in any script, an
 * emoji, `_`, `-`, `/`. Kept as a source fragment so the forms below cannot drift apart.
 */
const TAG_BODY =
  '[\\p{L}\\p{N}_/\\-\\p{Extended_Pictographic}\\p{Emoji_Modifier}\\p{Regional_Indicator}\\u200D\\uFE0F]+';
/**
 * A `#` opening a tag stands at the start of the text or directly after a space or a tab, which is
 * what tells `#errands` from `C#`, `foo#bar` and a URL's `/#section`.
 */
const TAG_IN_TEXT = new RegExp(`(?<=^|[ \\t])#(${TAG_BODY})`, 'gu');
/** The same body, checked against a whole string rather than found within one. */
const VALID_TAG = new RegExp(`^${TAG_BODY}$`, 'u');
/** Obsidian reads a run of digits alone as a number, so `#123` stays ordinary text. */
const DIGITS_ONLY = /^\p{N}+$/u;

export interface ParsedTaskLine {
  /** The list marker, kept verbatim so indentation survives. */
  readonly prefix: string;
  /** The single character inside the checkbox brackets, e.g. ' ' or 'x'. */
  readonly checkbox: string;
  /** The line's own text verbatim, tags in place, without the block id anchor. */
  readonly text: string;
  /** What `text` reads as once its tags are taken out — what the provider is told the task is called. */
  readonly title: string;
  /** The tags standing in `text`, in the order they appear there. */
  readonly tags: readonly string[];
  readonly blockId: string | undefined;
}

/** What a task line is made of; `title` and `tags` are read out of `text` rather than given. */
export interface TaskLineParts {
  readonly prefix: string;
  readonly checkbox: string;
  readonly text: string;
  readonly blockId: string | undefined;
}

/** The one way a `ParsedTaskLine` is built, so `title` and `tags` can never disagree with `text`. */
export function taskLineFrom(parts: TaskLineParts): ParsedTaskLine {
  return {
    ...parts,
    title: removeTags(parts.text, () => true).trim(),
    tags: tagsIn(parts.text).map((tag) => tag.name),
  };
}

/**
 * The pulled title with the line's tags after it: where a tag stood inside the previous text
 * cannot survive text that no longer exists, so it moves to the trailing position.
 */
export function withTitle(task: ParsedTaskLine, title: string): ParsedTaskLine {
  return withText(task, appendTags(title, task.tags));
}

/**
 * A label taken away in the provider is taken out of the text where it stands, leaving the rest of
 * it alone; a new one is appended at the end, the only place text that never carried it can offer.
 */
export function withTags(task: ParsedTaskLine, tags: readonly string[]): ParsedTaskLine {
  const stillThere = new Set(tags);
  const kept = removeTags(task.text, (name) => !stillThere.has(name)).trim();

  return withText(task, appendTags(kept, tags.filter((tag) => !task.tags.includes(tag))));
}

function withText(task: ParsedTaskLine, text: string): ParsedTaskLine {
  return taskLineFrom({ prefix: task.prefix, checkbox: task.checkbox, text, blockId: task.blockId });
}

/** `#tag` tokens after the text they belong to — the trailing place a newly pulled tag is written. */
function appendTags(text: string, tags: readonly string[]): string {
  return [text, ...tags.map((tag) => `#${tag}`)].filter((part) => part.length > 0).join(' ');
}

/**
 * Any checkbox character other than a plain space reads as done. A richer, user-defined state
 * (e.g. the Tasks plugin's `[/]` or `[-]`) is not given separate meaning here — see Feature 11.
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
  return VALID_TAG.test(label) && !DIGITS_ONLY.test(label);
}

/** Where one tag stands in a text, so it can be read off or taken out without re-finding it. */
interface TagInText {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

/** Every tag of a text, wherever it stands, in the order it appears. */
function tagsIn(text: string): TagInText[] {
  const code = codeSpans(text);
  const found: TagInText[] = [];

  for (const match of text.matchAll(TAG_IN_TEXT)) {
    const start = match.index ?? 0;

    if (!DIGITS_ONLY.test(match[1]) && !code.some(([from, to]) => start >= from && start < to)) {
      found.push({ name: match[1], start, end: start + match[0].length });
    }
  }

  return found;
}

/**
 * Takes the chosen tags out of the text, each together with one adjoining space — the one before
 * it where there is one to spare, else the one after it — so the rest keeps its own spacing.
 */
function removeTags(text: string, shouldRemove: (name: string) => boolean): string {
  const kept: string[] = [];
  let cursor = 0;

  for (const tag of tagsIn(text)) {
    if (!shouldRemove(tag.name)) {
      continue;
    }

    const spaceBefore = tag.start > cursor && isSpace(text[tag.start - 1]);
    kept.push(text.slice(cursor, spaceBefore ? tag.start - 1 : tag.start));
    cursor = !spaceBefore && isSpace(text[tag.end]) ? tag.end + 1 : tag.end;
  }

  kept.push(text.slice(cursor));

  return kept.join('');
}

/** Inline code spans, delimited by backtick runs of equal length, where a `#tag` is only text. */
function codeSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let open: RegExpMatchArray | undefined;

  for (const run of text.matchAll(/`+/g)) {
    if (open === undefined) {
      open = run;
    } else if (run[0].length === open[0].length) {
      spans.push([open.index ?? 0, (run.index ?? 0) + run[0].length]);
      open = undefined;
    }
  }

  return spans;
}

function isSpace(character: string | undefined): boolean {
  return character === ' ' || character === '\t';
}

export function parseTaskLine(line: string): ParsedTaskLine | undefined {
  const match = TASK_LINE.exec(line);

  if (match === null) {
    return undefined;
  }

  const [, prefix, checkbox, remainder] = match;
  const withBlockId = TRAILING_BLOCK_ID.exec(remainder);
  const [text, blockId] = withBlockId === null ? [remainder, undefined] : [withBlockId[1], withBlockId[2]];

  return taskLineFrom({ prefix, checkbox, text, blockId });
}

/** Renders the line's own text verbatim, so one the pass never changed comes back byte for byte. */
export function formatTaskLine(task: ParsedTaskLine): string {
  const anchor = task.blockId === undefined ? '' : ` ^${task.blockId}`;

  return `${task.prefix}[${task.checkbox}] ${task.text}${anchor}`;
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
