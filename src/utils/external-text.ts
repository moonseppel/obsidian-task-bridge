const MAX_DISPLAYABLE_LENGTH = 200;
const NON_PRINTABLE_CHARACTERS = /\p{C}+/gu;
const NON_PRINTABLE_CHARACTER = /\p{C}/gu;

export function sanitizeForDisplay(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const collapsed = value.replace(NON_PRINTABLE_CHARACTERS, ' ').trim();

  return collapsed.length > MAX_DISPLAYABLE_LENGTH
    ? `${collapsed.slice(0, MAX_DISPLAYABLE_LENGTH)}…`
    : collapsed;
}

/**
 * Makes a task title safe to sit on a single markdown line without shortening it. A line break
 * would split the task in two, so it becomes a space; truncating would lose the user's own words,
 * which is why this never shortens the way `sanitizeForDisplay` does.
 */
export function sanitizeTitle(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(NON_PRINTABLE_CHARACTERS, ' ').trim();
}

/** Like sanitizeTitle, but a description is genuinely multi-line, so a newline survives untouched. */
export function sanitizeDescription(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(NON_PRINTABLE_CHARACTER, (char) => (char === '\n' ? char : ' ')).trim();
}
