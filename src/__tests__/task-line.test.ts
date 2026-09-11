import { collectBlockIds, formatTaskLine, isDone, parseTaskLine } from '../services/sync/task-line';

describe('parseTaskLine', () => {
  it.each([
    ['- [ ] Buy milk', '- ', 'Buy milk'],
    ['* [ ] Buy milk', '* ', 'Buy milk'],
    ['+ [ ] Buy milk', '+ ', 'Buy milk'],
    ['1. [ ] Buy milk', '1. ', 'Buy milk'],
    ['2) [ ] Buy milk', '2) ', 'Buy milk'],
  ])('recognises %s as a task', (line, prefix, title) => {
    expect(parseTaskLine(line)).toEqual({ prefix, checkbox: ' ', title, blockId: null });
  });

  it('keeps the indentation of a nested task in the prefix', () => {
    expect(parseTaskLine('    - [ ] Nested')?.prefix).toBe('    - ');
  });

  it.each(['x', 'X', '/', '-'])('treats [%s] as a checkbox too', (marker) => {
    const task = parseTaskLine(`- [${marker}] Done thing`);

    expect(task?.title).toBe('Done thing');
    expect(task?.checkbox).toBe(marker);
  });

  it('splits a trailing block id off the title', () => {
    expect(parseTaskLine('- [ ] Buy milk ^ots-a1b2c3')).toEqual({
      prefix: '- ',
      checkbox: ' ',
      title: 'Buy milk',
      blockId: 'ots-a1b2c3',
    });
  });

  it('takes the last caret as the block id and leaves earlier ones in the title', () => {
    expect(parseTaskLine('- [ ] Read ^chapter ^ots-a1')).toEqual({
      prefix: '- ',
      checkbox: ' ',
      title: 'Read ^chapter',
      blockId: 'ots-a1',
    });
  });

  it('keeps a caret that is part of the title when no block id follows', () => {
    expect(parseTaskLine('- [ ] Compute 2^8')?.title).toBe('Compute 2^8');
  });

  it('reports an empty title for a checkbox with nothing after it', () => {
    expect(parseTaskLine('- [ ]  ')?.title).toBe('');
  });

  it.each([
    ['- Plain bullet', 'a bullet without a checkbox'],
    ['Just a paragraph', 'ordinary prose'],
    ['- [] Missing marker', 'an empty checkbox'],
    ['- [ ]No space after the box', 'a checkbox the text is glued to'],
    ['', 'a blank line'],
  ])('rejects %s, which is %s', (line) => {
    expect(parseTaskLine(line)).toBeNull();
  });
});

describe('isDone', () => {
  it('reads a space as not done', () => {
    expect(isDone(parseTaskLine('- [ ] Buy milk')!)).toBe(false);
  });

  it.each(['x', 'X', '/', '-'])('reads %s as done', (marker) => {
    expect(isDone(parseTaskLine(`- [${marker}] Buy milk`)!)).toBe(true);
  });
});

describe('formatTaskLine', () => {
  it('appends the block id when there is one', () => {
    expect(formatTaskLine({ prefix: '- ', checkbox: ' ', title: 'Buy milk', blockId: 'ots-a1' })).toBe(
      '- [ ] Buy milk ^ots-a1',
    );
  });

  it('leaves the line bare when there is no block id', () => {
    expect(formatTaskLine({ prefix: '- ', checkbox: 'x', title: 'Buy milk', blockId: null })).toBe(
      '- [x] Buy milk',
    );
  });

  it.each([
    '- [ ] Buy milk ^ots-a1',
    '    - [x] Nested and done ^ots-b2',
    '3. [ ] Numbered',
    '- [/] Tasks-plugin-style state ^ots-c3',
  ])('round trips %s unchanged', (line) => {
    const parsed = parseTaskLine(line);

    expect(parsed).not.toBeNull();
    expect(formatTaskLine(parsed!)).toBe(line);
  });
});

describe('collectBlockIds', () => {
  it('finds block ids on task lines and on ordinary lines alike', () => {
    const ids = collectBlockIds(['- [ ] Buy milk ^ots-a1', 'A paragraph ^note-7', '- [ ] Bare']);

    expect([...ids].sort()).toEqual(['note-7', 'ots-a1']);
  });

  it('finds nothing in a note without anchors', () => {
    expect(collectBlockIds(['- [ ] Buy milk', 'Some prose']).size).toBe(0);
  });
});
