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

/** Where a run of fields another plugin reads at the end of a task's text starts; its length for none. */
export type TrailingFieldsFinder = (text: string) => number;

/** Without a plugin reading fields at the end of a line, a line has none. */
export const NO_TRAILING_FIELDS: TrailingFieldsFinder = (text) => text.length;

export interface ParsedTaskLine {
  /** The list marker, kept verbatim so indentation survives. */
  readonly prefix: string;
  /** The single character inside the checkbox brackets, e.g. ' ' or 'x'. */
  readonly checkbox: string;
  /**
   * The line's own text verbatim, tags in place, up to where a run of trailing fields starts — the
   * Tasks plugin's `📅 2026-09-20`, say. Together with `fields` it is the whole text, anchor aside.
   */
  readonly body: string;
  /** The run of trailing fields, verbatim; empty when the line ends in none. */
  readonly fields: string;
  /** What `body` reads as once its tags are taken out — what the provider is told the task is called. */
  readonly title: string;
  /** The tags standing anywhere in the text, fields included, in the order they appear there. */
  readonly tags: readonly string[];
  readonly blockId: string | undefined;
}

/** What a task line is made of; `title` and `tags` are read out of the text rather than given. */
export interface TaskLineParts {
  readonly prefix: string;
  readonly checkbox: string;
  readonly body: string;
  readonly fields?: string;
  readonly blockId: string | undefined;
}

/** The one way a `ParsedTaskLine` is built, so `title` and `tags` can never disagree with the text. */
export function taskLineFrom(parts: TaskLineParts): ParsedTaskLine {
  const fields = parts.fields ?? '';

  return {
    ...parts,
    fields,
    title: removeTags(parts.body, () => true).trim(),
    tags: tagsIn(parts.body + fields).map((tag) => tag.name),
  };
}

/**
 * The pulled title with the tags of the text it replaces after it: where a tag stood inside that
 * text cannot survive text that no longer exists, so it moves to the trailing position. The fields
 * stay as they were, together with any tag standing among them.
 */
export function withTitle(task: ParsedTaskLine, title: string): ParsedTaskLine {
  const bodyTags = tagsIn(task.body).map((tag) => tag.name);

  return withText(task, appendTags(title, bodyTags), task.fields);
}

/**
 * A label taken away in the provider is taken out of the text where it stands, among the fields
 * too, leaving the rest of it alone; a new one is appended after the title, the only place text
 * that never carried it can offer.
 */
export function withTags(task: ParsedTaskLine, tags: readonly string[]): ParsedTaskLine {
  const stillThere = new Set(tags);
  const isGone = (name: string): boolean => !stillThere.has(name);
  const keptBody = removeTags(task.body, isGone).trim();
  const keptFields = removeTags(task.fields, isGone).trim();

  return withText(task, appendTags(keptBody, tags.filter((tag) => !task.tags.includes(tag))), keptFields);
}

function withText(task: ParsedTaskLine, body: string, fields: string): ParsedTaskLine {
  const separator = body.length > 0 && fields.length > 0 ? ' ' : '';
  const { prefix, checkbox, blockId } = task;

  return taskLineFrom({ prefix, checkbox, body: body + separator, fields, blockId });
}

/** `#tag` tokens after the text they belong to — the trailing place a newly pulled tag is written. */
function appendTags(text: string, tags: readonly string[]): string {
  return [text, ...tags.map((tag) => `#${tag}`)].filter((part) => part.length > 0).join(' ');
}

/** Where a tag ending the text starts, if the text ends in one. */
export function trailingTagStart(text: string): number | undefined {
  const last = tagsIn(text).at(-1);

  return last !== undefined && last.end === text.length ? last.start : undefined;
}

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

/** Without a finder for trailing fields, the whole text is body, as it is without the Tasks plugin. */
export function parseTaskLine(
  line: string,
  findTrailingFields: TrailingFieldsFinder = NO_TRAILING_FIELDS,
): ParsedTaskLine | undefined {
  const match = TASK_LINE.exec(line);

  if (match === null) {
    return undefined;
  }

  const [, prefix, checkbox, remainder] = match;
  const withBlockId = TRAILING_BLOCK_ID.exec(remainder);
  const [text, blockId] = withBlockId === null ? [remainder, undefined] : [withBlockId[1], withBlockId[2]];

  const fieldsStart = findTrailingFields(text);

  return taskLineFrom({ prefix, checkbox, body: text.slice(0, fieldsStart), fields: text.slice(fieldsStart), blockId });
}

/** Renders the line's own text verbatim, so one the pass never changed comes back byte for byte. */
export function formatTaskLine(task: ParsedTaskLine): string {
  const anchor = task.blockId === undefined ? '' : ` ^${task.blockId}`;

  return `${task.prefix}[${task.checkbox}] ${task.body}${task.fields}${anchor}`;
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
