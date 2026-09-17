import {
  composeRemoteDescription,
  extractUserDescription,
  readDescriptionBlock,
  renderDescriptionBlock,
} from '../../../../services/sync/task-format/task-description';

describe('readDescriptionBlock', () => {
  it('captures a single indented line below the task', () => {
    const lines = ['- [ ] Buy milk', '\tOat milk, not regular'];

    expect(readDescriptionBlock(lines, 0)).toEqual({ startLine: 1, lineCount: 1, text: 'Oat milk, not regular' });
  });

  it('captures multiple contiguous indented lines', () => {
    const lines = ['- [ ] Buy milk', '\tOat milk, not regular', '\tCheck the wishlist too'];

    expect(readDescriptionBlock(lines, 0)).toEqual({
      startLine: 1,
      lineCount: 2,
      text: 'Oat milk, not regular\nCheck the wishlist too',
    });
  });

  it('reports nothing captured when the next line is not indented at all', () => {
    expect(readDescriptionBlock(['- [ ] Buy milk', 'Not indented'], 0)).toEqual({
      startLine: 1,
      lineCount: 0,
      text: '',
    });
  });

  it('reports nothing captured when the task is the last line', () => {
    expect(readDescriptionBlock(['- [ ] Buy milk'], 0)).toEqual({ startLine: 1, lineCount: 0, text: '' });
  });

  it('stops at a blank line', () => {
    const lines = ['- [ ] Buy milk', '\tOat milk', '', '\tNot part of the description'];

    expect(readDescriptionBlock(lines, 0).text).toBe('Oat milk');
  });

  it('keeps the description open across a tab-only line', () => {
    const lines = ['- [ ] Buy milk', '\tOat milk', '\t', '\tCheck the wishlist too'];

    expect(readDescriptionBlock(lines, 0).lineCount).toBe(3);
  });

  it('captures a bullet, its continuation and a paragraph after it', () => {
    const lines = [
      '- [ ] Test for complex description',
      '\t- this is a bullet point in the description.',
      '\t  This should still be part of the bullet point.',
      '\tThis should not be part of the bullet point, but part of the description.',
    ];

    expect(readDescriptionBlock(lines, 0).lineCount).toBe(3);
  });

  it('stops at a line indented no deeper than the task itself', () => {
    const lines = ['- [ ] Buy milk', '\tOat milk', '- [ ] Second task'];

    expect(readDescriptionBlock(lines, 0)).toEqual({ startLine: 1, lineCount: 1, text: 'Oat milk' });
  });

  it('stops at a line shallower than a nested task', () => {
    const lines = ['\t\t- [x] nested grandchild 1', '\t\t\tHow confusing is that?!', '- [ ] not nested grandchild 2'];

    expect(readDescriptionBlock(lines, 0).lineCount).toBe(1);
  });

  it('stops at a nested task line even though it is still indented deeper', () => {
    const lines = ['- [ ] Buy milk', '\tOat milk', '\t- [ ] A nested task', '\tMore text after it'];

    expect(readDescriptionBlock(lines, 0)).toEqual({ startLine: 1, lineCount: 1, text: 'Oat milk' });
  });

  it('keeps a checkbox line with spaces after its tabs as description text', () => {
    const lines = ['- [ ] Buy milk', '\t  - [ ] Not a task', '\tMore text after it'];

    expect(readDescriptionBlock(lines, 0).lineCount).toBe(2);
  });

  it('reads a checkbox line two levels deeper as description text', () => {
    const lines = ['- [ ] another nesting test', '\t\t- [ ] direct grandchild ^tb-n7v6x7uo'];

    expect(readDescriptionBlock(lines, 0).text).toBe('\t- [ ] direct grandchild ^tb-n7v6x7uo');
  });

  it('reads a line indented with a full run of spaces as one level deeper, so it starts a description', () => {
    const lines = ['- [ ] Buy milk', '    Oat milk (four spaces)'];

    expect(readDescriptionBlock(lines, 0)).toEqual({ startLine: 1, lineCount: 1, text: 'Oat milk (four spaces)' });
  });

  it('dedents by whole levels, leaving the spaces left over after the removed one in place', () => {
    const lines = ['- [ ] Buy milk', '      Six spaces, one level and two over'];

    expect(readDescriptionBlock(lines, 0).text).toBe('  Six spaces, one level and two over');
  });

  it('reads the test vault\'s soft-break continuation, written with spaces, as part of the description', () => {
    const lines = [
      '- [ ] Test for complex description',
      '\t- this is a bullet point in the description.',
      '      This should still be part of the bullet point.',
      '\tThis should not be part of the bullet point, but part of the description.',
      '\t',
      '\tThis should also be part of the description.',
      '',
    ];

    expect(readDescriptionBlock(lines, 0)).toEqual({
      startLine: 1,
      lineCount: 5,
      text: [
        '- this is a bullet point in the description.',
        '  This should still be part of the bullet point.',
        'This should not be part of the bullet point, but part of the description.',
        '',
        'This should also be part of the description.',
      ].join('\n'),
    });
  });

  it('treats a line indented with fewer spaces than the tab size as level 0, so it starts no description', () => {
    const lines = ['- [ ] Buy milk', '   Oat milk (three spaces)'];

    expect(readDescriptionBlock(lines, 0).lineCount).toBe(0);
  });

  it('keeps a nested task line\'s own extra indentation relative to the block, once dedented', () => {
    const lines = ['- [ ] Buy milk', '\tFirst line', '\t\tMore indented line'];

    expect(readDescriptionBlock(lines, 0).text).toBe('First line\n\tMore indented line');
  });

  it('removes exactly one indent level, keeping indentation the lines share beyond it', () => {
    const lines = ['- [ ] Buy milk', '\t\tsome text'];

    expect(readDescriptionBlock(lines, 0).text).toBe('\tsome text');
  });

  it('turns a tab-only line into an empty line of the text', () => {
    const lines = ['- [ ] Buy milk', '\tOat milk', '\t', '\tCheck the wishlist too'];

    expect(readDescriptionBlock(lines, 0).text).toBe('Oat milk\n\nCheck the wishlist too');
  });

  it('respects the indentation of a nested task line', () => {
    const lines = ['\t- [ ] Nested task', '\t\tIts description'];

    expect(readDescriptionBlock(lines, 0)).toEqual({ startLine: 1, lineCount: 1, text: 'Its description' });
  });
});

describe('renderDescriptionBlock', () => {
  it('renders each line one tab deeper than the task', () => {
    expect(renderDescriptionBlock('', 'Oat milk\nCheck the wishlist')).toEqual([
      '\tOat milk',
      '\tCheck the wishlist',
    ]);
  });

  it('adds the tab after the task\'s own indentation for a nested task', () => {
    expect(renderDescriptionBlock('  ', 'Its description')).toEqual(['  \tIts description']);
  });

  it('renders nothing for an empty description', () => {
    expect(renderDescriptionBlock('', '')).toEqual([]);
  });

  it('round-trips through readDescriptionBlock', () => {
    const lines = ['- [ ] Buy milk', ...renderDescriptionBlock('', 'Oat milk\nCheck the wishlist too')];

    expect(readDescriptionBlock(lines, 0).text).toBe('Oat milk\nCheck the wishlist too');
  });

  it('renders an empty line of the text as a tab-only line', () => {
    expect(renderDescriptionBlock('', 'Oat milk\n\nCheck the wishlist too')).toEqual([
      '\tOat milk',
      '\t',
      '\tCheck the wishlist too',
    ]);
  });

  it('settles a space-indented continuation after one pass, rendering it back as it now reads', () => {
    const pushed = readDescriptionBlock(['- [ ] A', '\t- bullet', '      continuation', ''], 0).text;
    const pulled = ['- [ ] A', ...renderDescriptionBlock('', pushed)];

    expect(readDescriptionBlock(pulled, 0).text).toBe(pushed);
  });

  it('round-trips the test vault\'s complex description to identical lines', () => {
    const description = [
      '\t- this is a bullet point in the description.',
      '\t  This should still be part of the bullet point.',
      '\tThis should not be part of the bullet point, but part of the description.',
      '\t',
      '\tThis should also be part of the description.',
    ];
    const { text } = readDescriptionBlock(['- [ ] Test for complex description', ...description, ''], 0);

    expect(renderDescriptionBlock('', text)).toEqual(description);
  });
});

describe('composeRemoteDescription', () => {
  it('is exactly the bare footer when there is no user text, unchanged from a freshly created task', () => {
    expect(composeRemoteDescription('', 'tb-a1b2c3d4')).toBe('TaskBridge ID: ^tb-a1b2c3d4');
  });

  it('puts the user text above a blank line and then the footer', () => {
    expect(composeRemoteDescription('Oat milk, not regular', 'tb-a1b2c3d4')).toBe(
      'Oat milk, not regular\n\nTaskBridge ID: ^tb-a1b2c3d4',
    );
  });
});

describe('extractUserDescription', () => {
  it('returns nothing for the bare footer alone', () => {
    expect(extractUserDescription('TaskBridge ID: ^tb-a1b2c3d4')).toBe('');
  });

  it('recovers the user text, dropping the blank line composeRemoteDescription inserted', () => {
    expect(extractUserDescription('Oat milk, not regular\n\nTaskBridge ID: ^tb-a1b2c3d4')).toBe(
      'Oat milk, not regular',
    );
  });

  it('finds the footer by searching rather than assuming it is the last line', () => {
    const description = 'Oat milk\n\nTaskBridge ID: ^tb-a1b2c3d4\nA note added after the fact';

    expect(extractUserDescription(description)).toBe('Oat milk');
  });

  it('keeps text before the footer even without a preceding blank line', () => {
    expect(extractUserDescription('Oat milk\nTaskBridge ID: ^tb-a1b2c3d4')).toBe('Oat milk');
  });

  it('returns the whole description untouched when it carries no footer at all', () => {
    expect(extractUserDescription('Just some notes')).toBe('Just some notes');
  });

  it('round-trips through composeRemoteDescription', () => {
    expect(extractUserDescription(composeRemoteDescription('Oat milk, not regular', 'tb-a1'))).toBe(
      'Oat milk, not regular',
    );
  });
});
