import { sanitizeForDisplay, sanitizeTitle } from '../utils/external-text';

describe('sanitizeForDisplay', () => {
  it('keeps ordinary text as it is', () => {
    expect(sanitizeForDisplay('Jan Pralle')).toBe('Jan Pralle');
  });

  it('discards values that are not text', () => {
    expect(sanitizeForDisplay(undefined)).toBe('');
  });

  it('replaces line breaks so a message cannot fake extra lines', () => {
    expect(sanitizeForDisplay('Unauthorized\n\nObsidian Task Sync: all good')).toBe(
      'Unauthorized Obsidian Task Sync: all good',
    );
  });

  it('strips zero-width characters used to hide content', () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b);
    expect(sanitizeForDisplay(`Jan${zeroWidthSpace}Pralle`)).toBe('Jan Pralle');
  });

  it('caps overlong text', () => {
    expect(sanitizeForDisplay('x'.repeat(500))).toHaveLength(201);
  });
});

describe('sanitizeTitle', () => {
  it('keeps a long title whole, because shortening it would lose the user\u2019s words', () => {
    const long = 'a'.repeat(500);

    expect(sanitizeTitle(long)).toBe(long);
  });

  it.each([
    ['One\nTwo', 'a line feed'],
    ['One\r\nTwo', 'a carriage return and line feed'],
    ['One\tTwo', 'a tab'],
    ['One\u0000Two', 'a null byte'],
  ])('replaces %s, which is %s, with a space', (input) => {
    expect(sanitizeTitle(input)).toBe('One Two');
  });

  it('trims the edges so a title never starts or ends with blank space', () => {
    expect(sanitizeTitle('  Buy milk  ')).toBe('Buy milk');
  });

  it('leaves inner spacing exactly as the user typed it', () => {
    expect(sanitizeTitle('Buy  oat   milk')).toBe('Buy  oat   milk');
  });

  it.each([null, undefined, 42, {}])('returns an empty string for %s', (value) => {
    expect(sanitizeTitle(value)).toBe('');
  });
});
