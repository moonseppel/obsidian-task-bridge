import { nearestAncestorLineNumbers, subtreeSpan } from '../services/sync/task-tree';

describe('nearestAncestorLineNumbers', () => {
  it('leaves a top-level task with no parent', () => {
    const lines = ['- [ ] A'];

    expect(nearestAncestorLineNumbers(lines).has(0)).toBe(false);
  });

  it('parents a nested task to the task directly above it', () => {
    const lines = ['- [ ] A', '\t- [ ] B'];

    expect(nearestAncestorLineNumbers(lines).get(1)).toBe(0);
  });

  it('parents two siblings at the same depth to the same ancestor', () => {
    const lines = ['- [ ] A', '\t- [ ] B', '\t- [ ] C'];
    const parents = nearestAncestorLineNumbers(lines);

    expect(parents.get(1)).toBe(0);
    expect(parents.get(2)).toBe(0);
  });

  it('parents a grandchild to its immediate parent, not the grandparent', () => {
    const lines = ['- [ ] A', '\t- [ ] B', '\t\t- [ ] C'];
    const parents = nearestAncestorLineNumbers(lines);

    expect(parents.get(1)).toBe(0);
    expect(parents.get(2)).toBe(1);
  });

  it('parents a nested task past intervening description text', () => {
    const lines = ['- [ ] A', '\tSome description', '\t- [ ] B'];

    expect(nearestAncestorLineNumbers(lines).get(2)).toBe(0);
  });

  it('leaves a task at the same indentation as an earlier task with no parent', () => {
    const lines = ['- [ ] A', '- [ ] B'];

    expect(nearestAncestorLineNumbers(lines).has(1)).toBe(false);
  });

  it('closes nesting at a blank line, leaving what follows top-level', () => {
    const lines = ['- [ ] A', '\t- [ ] B', '', '\t- [ ] C'];
    const parents = nearestAncestorLineNumbers(lines);

    expect(parents.get(1)).toBe(0);
    expect(parents.has(3)).toBe(false);
  });

  it('leaves a task indented with spaces only top-level', () => {
    const lines = ['- [ ] A', '    - [ ] B'];

    expect(nearestAncestorLineNumbers(lines).has(1)).toBe(false);
  });

  it('parents a nested task past a tab-only line', () => {
    const lines = ['- [ ] A', '\t', '\t- [ ] B'];

    expect(nearestAncestorLineNumbers(lines).get(2)).toBe(0);
  });

  it('returns a sibling to its parent once a deeper child block ends', () => {
    const lines = ['- [ ] A', '\t- [ ] B', '\t\t- [ ] C', '\t- [ ] D'];
    const parents = nearestAncestorLineNumbers(lines);

    expect(parents.get(3)).toBe(0);
  });
});

describe('subtreeSpan', () => {
  it('is empty when the task has no content below it', () => {
    expect(subtreeSpan(['- [ ] A'], 0)).toEqual({ startLine: 1, endLineExclusive: 1 });
  });

  it('spans a description block alone', () => {
    const lines = ['- [ ] A', '\tSome description'];

    expect(subtreeSpan(lines, 0)).toEqual({ startLine: 1, endLineExclusive: 2 });
  });

  it('spans a nested task, unlike readDescriptionBlock which stops there', () => {
    const lines = ['- [ ] A', '\t- [ ] B'];

    expect(subtreeSpan(lines, 0)).toEqual({ startLine: 1, endLineExclusive: 2 });
  });

  it('spans description text, a nested task, and that nested task\'s own description', () => {
    const lines = ['- [ ] A', '\tDescription', '\t- [ ] B', "\t\tB's description", '- [ ] C'];

    expect(subtreeSpan(lines, 0)).toEqual({ startLine: 1, endLineExclusive: 4 });
  });

  it('stops at a blank line', () => {
    const lines = ['- [ ] A', '\t- [ ] B', '', '\t- [ ] C'];

    expect(subtreeSpan(lines, 0)).toEqual({ startLine: 1, endLineExclusive: 2 });
  });

  it('spans past a tab-only line', () => {
    const lines = ['- [ ] A', '\tDescription', '\t', '\t- [ ] B', '- [ ] C'];

    expect(subtreeSpan(lines, 0)).toEqual({ startLine: 1, endLineExclusive: 4 });
  });

  it('stops at a line indented no deeper than the task itself', () => {
    const lines = ['- [ ] A', '\t- [ ] B', '- [ ] C'];

    expect(subtreeSpan(lines, 0)).toEqual({ startLine: 1, endLineExclusive: 2 });
  });

  it('stops at a line indented with spaces only', () => {
    const lines = ['- [ ] A', '    Some text'];

    expect(subtreeSpan(lines, 0)).toEqual({ startLine: 1, endLineExclusive: 1 });
  });
});
