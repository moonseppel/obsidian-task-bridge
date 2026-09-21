import { BLOCK_ID_PREFIX } from './block-id';

/** Labelled so the caret-prefixed id means something to a user reading the task in the provider. */
const ID_LABEL = 'TaskBridge ID: ';

/**
 * The longest part of the footer that never varies: the label, the caret and this plugin's own
 * block-id prefix. Everything the footer is found by, since neither its position nor a bare `^id`
 * identifies it — the user's own text may carry block ids of its own, on either side of it
 * (architecture-rules.md #38).
 */
const FOOTER_MARKER = `${ID_LABEL}^${BLOCK_ID_PREFIX}`;

const BLOCK_ID_BODY = /^[A-Za-z0-9-]+/;

export function composeRemoteDescription(userText: string, blockId: string): string {
  const footer = `${ID_LABEL}^${blockId}`;

  return userText.length === 0 ? footer : `${userText}\n\n${footer}`;
}

/**
 * The block id the footer names, or none where the description carries no footer at all. The last
 * marker wins, because `composeRemoteDescription` writes the footer last; where the user has
 * reproduced the whole marker themselves the two are genuinely indistinguishable, and picking the
 * last is the documented choice (spec 0.10.3, Scenario 3).
 */
export function findFooterBlockId(description: string): string | undefined {
  const markerAt = description.lastIndexOf(FOOTER_MARKER);

  if (markerAt === -1) {
    return undefined;
  }

  const body = BLOCK_ID_BODY.exec(description.slice(markerAt + FOOTER_MARKER.length))?.[0];

  return body === undefined ? undefined : `${BLOCK_ID_PREFIX}${body}`;
}

/**
 * Everything in the description that is not the footer, in the order the user wrote it. Text below
 * the footer is the user's own just as much as text above it, so it is kept rather than dropped and
 * destroyed by the next push; only the blank line this plugin inserted above the footer goes with
 * it (architecture-rules.md #38).
 */
export function extractUserDescription(rawDescription: string): string {
  const lines = rawDescription.split('\n');
  const footerIndex = lastFooterLine(lines);

  if (footerIndex === -1) {
    return rawDescription;
  }

  const above = lines.slice(0, footerIndex);
  const withoutInsertedBlankLine = above.length > 0 && above[above.length - 1] === '' ? above.slice(0, -1) : above;

  return [...withoutInsertedBlankLine, ...lines.slice(footerIndex + 1)].join('\n');
}

/**
 * The last labelled line, matching `findFooterBlockId`'s choice of the last marker so the line
 * taken out is the very one whose id was read. The label alone is enough here, and deliberately
 * wider than the marker: a footer carrying a block-id prefix this version no longer mints is still
 * the plugin's own line, and leaving it in the user's text would push it back into the note.
 */
function lastFooterLine(lines: readonly string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].includes(ID_LABEL)) {
      return index;
    }
  }

  return -1;
}
