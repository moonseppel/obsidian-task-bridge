import { DEFAULT_TAB_SIZE, Indentation, indentationOf } from '../../../../services/sync/task-format/indentation';

const indentation = new Indentation(4);

describe('levelOf', () => {
  it('counts a tab as one level', () => {
    expect(indentation.levelOf('\t\t- [ ] A')).toBe(2);
  });

  it('counts a complete run of tabSize spaces as one level', () => {
    expect(indentation.levelOf('    - [ ] A')).toBe(1);
  });

  it('counts a run shorter than tabSize as no level at all', () => {
    expect(indentation.levelOf('   - [ ] A')).toBe(0);
  });

  it('counts spaces left over after a complete run as no further level', () => {
    expect(indentation.levelOf('      text')).toBe(1);
  });

  it('counts tabs and complete runs of spaces together, left to right', () => {
    expect(indentation.levelOf('\t    \ttext')).toBe(3);
  });

  it('discards an incomplete run of spaces along with the tab that follows it', () => {
    expect(indentation.levelOf('  \ttext')).toBe(1);
  });

  it('starts a fresh run after a tab rather than carrying pending spaces over it', () => {
    expect(indentation.levelOf('  \t  text')).toBe(1);
  });

  it('gives an empty line no levels, so it still ends a description', () => {
    expect(indentation.levelOf('')).toBe(0);
  });

  it('counts a whitespace-only line by the same rule as any other', () => {
    expect(indentation.levelOf('\t')).toBe(1);
  });

  it('stops counting at the first character that is neither a tab nor a space', () => {
    expect(indentation.levelOf('\ta\t\tb')).toBe(1);
  });

  it('counts a run of another tab size under that tab size', () => {
    expect(new Indentation(2).levelOf('    text')).toBe(2);
  });

  it('counts by four by default, the tab size Obsidian itself starts with', () => {
    expect(new Indentation().levelOf(' '.repeat(DEFAULT_TAB_SIZE))).toBe(1);
  });
});

describe('levelsBelow', () => {
  it('measures a space-indented line against a tab-indented task as if both were tabs', () => {
    expect(indentation.levelsBelow('      continuation', '- [ ] A')).toBe(1);
  });

  it('gives a line no deeper than the task a difference of zero or less', () => {
    expect(indentation.levelsBelow('- [ ] B', '\t- [ ] A')).toBe(-1);
  });
});

describe('leftoverSpaces', () => {
  it('counts the spaces after the last complete level', () => {
    expect(indentation.leftoverSpaces('      text')).toBe(2);
  });

  it('counts none when the indentation ends on a complete level', () => {
    expect(indentation.leftoverSpaces('\t\ttext')).toBe(0);
  });

  it('counts an incomplete run with no level before it', () => {
    expect(indentation.leftoverSpaces('  text')).toBe(2);
  });

  it('counts none after a tab that discarded the spaces pending before it', () => {
    expect(indentation.leftoverSpaces('  \ttext')).toBe(0);
  });
});

describe('removeLevels', () => {
  it('removes a tab as one level', () => {
    expect(indentation.removeLevels('\t\ttext', 1)).toBe('\ttext');
  });

  it('removes a full run of spaces as one level', () => {
    expect(indentation.removeLevels('        text', 1)).toBe('    text');
  });

  it('leaves the spaces left over after the removed level in place', () => {
    expect(indentation.removeLevels('      text', 1)).toBe('  text');
  });

  it('leaves a line with no levels untouched', () => {
    expect(indentation.removeLevels('  text', 1)).toBe('  text');
  });

  it('removes nothing when asked for no levels', () => {
    expect(indentation.removeLevels('\ttext', 0)).toBe('\ttext');
  });

  it('removes every level it has when asked for more than there are', () => {
    expect(indentation.removeLevels('\ttext', 3)).toBe('text');
  });

  it('removes an incomplete run of spaces together with the tab it was discarded with', () => {
    expect(indentation.removeLevels('  \ttext', 1)).toBe('text');
  });
});

describe('indentationOf', () => {
  it('counts by the configured tab size', () => {
    expect(indentationOf(2).levelOf('    text')).toBe(2);
  });

  it('falls back to the default when the setting is absent', () => {
    expect(indentationOf(undefined).levelOf(' '.repeat(DEFAULT_TAB_SIZE))).toBe(1);
  });

  it('falls back to the default when the setting is not a number', () => {
    expect(indentationOf('4').levelOf(' '.repeat(DEFAULT_TAB_SIZE))).toBe(1);
  });

  it('falls back to the default when the setting is not larger than zero', () => {
    expect(indentationOf(0).levelOf(' '.repeat(DEFAULT_TAB_SIZE))).toBe(1);
  });

  it('falls back to the default when the setting is not a whole number', () => {
    expect(indentationOf(2.5).levelOf(' '.repeat(DEFAULT_TAB_SIZE))).toBe(1);
  });
});
