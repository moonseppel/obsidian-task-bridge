import { appendAnchorToLine } from '../../../../services/sync/note-access/anchor-write';

describe('appendAnchorToLine', () => {
  it('appends the block id to a bare task line', () => {
    const result = appendAnchorToLine('- [ ] Buy milk', 0, 'tb-a1');

    expect(result).toEqual({ content: '- [ ] Buy milk ^tb-a1', appended: true });
  });

  it('leaves every other line untouched', () => {
    const result = appendAnchorToLine('- [ ] First\n- [ ] Second', 1, 'tb-a1');

    expect(result.content).toBe('- [ ] First\n- [ ] Second ^tb-a1');
  });

  it('reports success without changing anything when the line already carries this exact id', () => {
    const original = '- [ ] Buy milk ^tb-a1';

    const result = appendAnchorToLine(original, 0, 'tb-a1');

    expect(result).toEqual({ content: original, appended: true });
  });

  it('refuses to overwrite a different block id already on the line', () => {
    const original = '- [ ] Buy milk ^tb-other';

    const result = appendAnchorToLine(original, 0, 'tb-a1');

    expect(result).toEqual({ content: original, appended: false });
  });

  it('refuses when the line no longer parses as a task at all', () => {
    const original = 'Just a paragraph now';

    const result = appendAnchorToLine(original, 0, 'tb-a1');

    expect(result).toEqual({ content: original, appended: false });
  });

  it('refuses when the line is a checkbox line inside a description rather than a task', () => {
    const original = '- [ ] Parent\n\t\t- [ ] Description text';

    const result = appendAnchorToLine(original, 1, 'tb-a1');

    expect(result).toEqual({ content: original, appended: false });
  });

  it('refuses when the line number no longer exists', () => {
    const original = '- [ ] Only line';

    const result = appendAnchorToLine(original, 5, 'tb-a1');

    expect(result).toEqual({ content: original, appended: false });
  });
});
