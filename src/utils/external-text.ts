const MAX_DISPLAYABLE_LENGTH = 200;
const NON_PRINTABLE_CHARACTERS = /\p{C}+/gu;

export function sanitizeForDisplay(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const collapsed = value.replace(NON_PRINTABLE_CHARACTERS, ' ').trim();

  return collapsed.length > MAX_DISPLAYABLE_LENGTH
    ? `${collapsed.slice(0, MAX_DISPLAYABLE_LENGTH)}…`
    : collapsed;
}
