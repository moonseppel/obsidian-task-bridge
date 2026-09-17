import {
  composeRemoteDescription,
  extractUserDescription,
  findFooterBlockId,
} from '../../../../services/sync/task-format/task-footer';

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

  it('keeps text the user wrote below the footer, which is theirs just as much as text above it', () => {
    const description = 'Oat milk\n\nTaskBridge ID: ^tb-a1b2c3d4\nA note added after the fact';

    expect(extractUserDescription(description)).toBe('Oat milk\nA note added after the fact');
  });

  it('keeps a blank line below the footer, which the user left there rather than the plugin', () => {
    const description = 'Oat milk\n\nTaskBridge ID: ^tb-a1b2c3d4\n\nA note added after the fact';

    expect(extractUserDescription(description)).toBe('Oat milk\n\nA note added after the fact');
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

describe('findFooterBlockId', () => {
  it('reads the block id the footer names', () => {
    expect(findFooterBlockId('TaskBridge ID: ^tb-a1b2c3d4')).toBe('tb-a1b2c3d4');
  });

  it('finds it wherever the footer stands, not only on the description\'s last line', () => {
    expect(findFooterBlockId('TaskBridge ID: ^tb-a1b2c3d4\nA note added after the fact')).toBe('tb-a1b2c3d4');
  });

  it('never takes a block id the description\'s own text carries, above or below the footer', () => {
    const description = '- [ ] direct grandchild ^tb-e5f6g7h8\n\nTaskBridge ID: ^tb-a1b2c3d4\n^tb-i9j0k1l2';

    expect(findFooterBlockId(description)).toBe('tb-a1b2c3d4');
  });

  it('finds nothing where the description carries block ids but no footer at all', () => {
    expect(findFooterBlockId('Some notes\n^tb-a1b2c3d4\nMore notes added afterward')).toBeUndefined();
  });

  it('finds nothing where the user wrote the label by hand without a block id behind it', () => {
    expect(findFooterBlockId('TaskBridge ID: whatever that is')).toBeUndefined();
  });

  it('finds nothing where the footer breaks off before naming an id', () => {
    expect(findFooterBlockId('TaskBridge ID: ^tb-')).toBeUndefined();
  });

  /** Spec 0.10.3, Scenario 3: two whole footers are genuinely indistinguishable, and the last wins. */
  it('takes the last of two whole footers, since nothing tells the plugin\'s from the user\'s', () => {
    expect(findFooterBlockId('TaskBridge ID: ^tb-usertext\n\nTaskBridge ID: ^tb-a1b2c3d4')).toBe('tb-a1b2c3d4');
  });

  it('round-trips a block id through composeRemoteDescription', () => {
    expect(findFooterBlockId(composeRemoteDescription('Oat milk', 'tb-a1b2c3d4'))).toBe('tb-a1b2c3d4');
  });
});
