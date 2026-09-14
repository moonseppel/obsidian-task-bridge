import {
  composeRemoteDescription,
  extractUserDescription,
  readDescriptionBlock,
  renderDescriptionBlock,
} from '../services/sync/task-description';

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

  it('stops at a line indented no deeper than the task itself', () => {
    const lines = ['- [ ] Buy milk', '\tOat milk', '- [ ] Second task'];

    expect(readDescriptionBlock(lines, 0)).toEqual({ startLine: 1, lineCount: 1, text: 'Oat milk' });
  });

  it('stops at a nested task line even though it is still indented deeper', () => {
    const lines = ['- [ ] Buy milk', '\tOat milk', '\t- [ ] A nested task', '\tMore text after it'];

    expect(readDescriptionBlock(lines, 0)).toEqual({ startLine: 1, lineCount: 1, text: 'Oat milk' });
  });

  it('accepts any deeper whitespace, not only a literal tab', () => {
    const lines = ['- [ ] Buy milk', '    Oat milk (four spaces)'];

    expect(readDescriptionBlock(lines, 0).text).toBe('Oat milk (four spaces)');
  });

  it('keeps a nested task line\'s own extra indentation relative to the block, once dedented', () => {
    const lines = ['- [ ] Buy milk', '\tFirst line', '\t\tMore indented line'];

    expect(readDescriptionBlock(lines, 0).text).toBe('First line\n\tMore indented line');
  });

  it('respects the indentation of a nested task line', () => {
    const lines = ['  - [ ] Nested task', '  \tIts description'];

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
});

describe('composeRemoteDescription', () => {
  it('is exactly the bare footer when there is no user text, unchanged from a freshly created task', () => {
    expect(composeRemoteDescription('', 'ots-a1b2c3d4')).toBe('TaskBridge ID: ^ots-a1b2c3d4');
  });

  it('puts the user text above a blank line and then the footer', () => {
    expect(composeRemoteDescription('Oat milk, not regular', 'ots-a1b2c3d4')).toBe(
      'Oat milk, not regular\n\nTaskBridge ID: ^ots-a1b2c3d4',
    );
  });
});

describe('extractUserDescription', () => {
  it('returns nothing for the bare footer alone', () => {
    expect(extractUserDescription('TaskBridge ID: ^ots-a1b2c3d4')).toBe('');
  });

  it('recovers the user text, dropping the blank line composeRemoteDescription inserted', () => {
    expect(extractUserDescription('Oat milk, not regular\n\nTaskBridge ID: ^ots-a1b2c3d4')).toBe(
      'Oat milk, not regular',
    );
  });

  it('finds the footer by searching rather than assuming it is the last line', () => {
    const description = 'Oat milk\n\nTaskBridge ID: ^ots-a1b2c3d4\nA note added after the fact';

    expect(extractUserDescription(description)).toBe('Oat milk');
  });

  it('keeps text before the footer even without a preceding blank line', () => {
    expect(extractUserDescription('Oat milk\nTaskBridge ID: ^ots-a1b2c3d4')).toBe('Oat milk');
  });

  it('returns the whole description untouched when it carries no footer at all', () => {
    expect(extractUserDescription('Just some notes')).toBe('Just some notes');
  });

  it('round-trips through composeRemoteDescription', () => {
    expect(extractUserDescription(composeRemoteDescription('Oat milk, not regular', 'ots-a1'))).toBe(
      'Oat milk, not regular',
    );
  });
});
