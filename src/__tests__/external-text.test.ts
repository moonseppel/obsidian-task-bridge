import { sanitizeForDisplay } from '../utils/external-text';

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
