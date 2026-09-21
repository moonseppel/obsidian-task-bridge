import { trailingTagStart } from '../sync/task-format/task-line';

const DATE = '\\d{4}-\\d{2}-\\d{2}';
const ID = '[a-zA-Z0-9_-]+';
const IDS = `${ID}( *, *${ID} *)*`;
const RECURRENCE = '[a-zA-Z0-9, !]+';
const ON_COMPLETION = '[a-zA-Z]+';

/** Each emoji field the Tasks plugin reads, as `symbol` and the value following it, if it takes one. */
const EMOJI_FIELDS: ReadonlyArray<readonly [symbol: string, value: string]> = [
  ['(?:🔺|⏫|🔼|🔽|⏬)', ''],
  ['(?:📅|📆|🗓)', DATE],
  ['(?:⏳|⌛)', DATE],
  ['🛫', DATE],
  ['➕', DATE],
  ['✅', DATE],
  ['❌', DATE],
  ['🔁', RECURRENCE],
  ['🏁', ON_COMPLETION],
  ['🆔', ID],
  ['⛔', IDS],
];

/** A `[` or a `(`, as long as a matching closing bracket follows somewhere. */
const DATAVIEW_OPENING = '(?:(?=[^\\]]+\\])\\[|(?=[^)]+\\))\\()';

/** Each Dataview key the Tasks plugin reads, with the value it accepts; any other key is plain text to it. */
const DATAVIEW_FIELDS: ReadonlyArray<readonly [key: string, value: string]> = [
  ['priority', 'highest|high|medium|low|lowest'],
  ['due', DATE],
  ['scheduled', DATE],
  ['start', DATE],
  ['created', DATE],
  ['completion', DATE],
  ['cancelled', DATE],
  ['repeat', RECURRENCE],
  ['onCompletion', ON_COMPLETION],
  ['id', ID],
  ['dependsOn', IDS],
];

/** The Tasks plugin's own patterns (8.4.0), each matching one field standing at the very end of a text. */
const FIELD_AT_END: readonly RegExp[] = [
  ...EMOJI_FIELDS.map(([symbol, value]) => emojiFieldAtEnd(symbol, value)),
  ...DATAVIEW_FIELDS.map(([key, value]) => dataviewFieldAtEnd(key, value)),
];

/**
 * Where the run of Tasks plugin fields at the end of a task's text starts, or the text's length when
 * it ends in none. Worked out the way the Tasks plugin reads a line, one field or tag at a time from
 * the end, so something that only looks like a field further in stays part of the title, as it does
 * there. Tags left of the first field are not part of the run: nothing tells them apart from a title's.
 */
export function trailingFieldsStart(text: string): number {
  let runStart = text.length;
  let end = text.trimEnd().length;

  for (;;) {
    const rest = text.slice(0, end);
    const fieldStart = firstFieldAtEnd(rest);
    const itemStart = fieldStart ?? trailingTagStart(rest);

    if (itemStart === undefined) {
      return runStart;
    }

    runStart = fieldStart ?? runStart;
    end = rest.slice(0, itemStart).trimEnd().length;
  }
}

function firstFieldAtEnd(text: string): number | undefined {
  for (const field of FIELD_AT_END) {
    const match = field.exec(text);

    if (match !== null) {
      return match.index;
    }
  }

  return undefined;
}

function emojiFieldAtEnd(symbol: string, value: string): RegExp {
  const valuePart = value === '' ? '' : ` *(?:${value})`;

  return new RegExp(`${symbol}\\uFE0F?${valuePart}$`, 'u');
}

function dataviewFieldAtEnd(key: string, value: string): RegExp {
  return new RegExp(`${DATAVIEW_OPENING} *${key}:: *(?:${value}) *[)\\]](?: *,)?$`, 'u');
}
