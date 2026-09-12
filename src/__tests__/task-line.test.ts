import {
  collectBlockIds,
  formatTaskLine,
  isDone,
  isRepresentableAsTag,
  parseTaskLine,
} from '../services/sync/task-line';

describe('parseTaskLine', () => {
  it.each([
    ['- [ ] Buy milk', '- ', 'Buy milk'],
    ['* [ ] Buy milk', '* ', 'Buy milk'],
    ['+ [ ] Buy milk', '+ ', 'Buy milk'],
    ['1. [ ] Buy milk', '1. ', 'Buy milk'],
    ['2) [ ] Buy milk', '2) ', 'Buy milk'],
  ])('recognises %s as a task', (line, prefix, title) => {
    expect(parseTaskLine(line)).toEqual({ prefix, checkbox: ' ', title, tags: [], blockId: null });
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
      tags: [],
      blockId: 'ots-a1b2c3',
    });
  });

  it('takes the last caret as the block id and leaves earlier ones in the title', () => {
    expect(parseTaskLine('- [ ] Read ^chapter ^ots-a1')).toEqual({
      prefix: '- ',
      checkbox: ' ',
      title: 'Read ^chapter',
      tags: [],
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

  describe('tags', () => {
    it('splits a single trailing tag off the title', () => {
      expect(parseTaskLine('- [ ] Renew passport #errands')).toEqual({
        prefix: '- ',
        checkbox: ' ',
        title: 'Renew passport',
        tags: ['errands'],
        blockId: null,
      });
    });

    it('splits multiple trailing tags off the title, in order', () => {
      expect(parseTaskLine('- [ ] Renew passport #errands #urgent')?.tags).toEqual(['errands', 'urgent']);
    });

    it('finds trailing tags before the block id', () => {
      expect(parseTaskLine('- [ ] Renew passport #errands #urgent ^ots-a1')).toEqual({
        prefix: '- ',
        checkbox: ' ',
        title: 'Renew passport',
        tags: ['errands', 'urgent'],
        blockId: 'ots-a1',
      });
    });

    it('leaves a mid-sentence tag as ordinary text in the title, not a tag', () => {
      const task = parseTaskLine('- [ ] Ask about #hashtags in general');

      expect(task?.title).toBe('Ask about #hashtags in general');
      expect(task?.tags).toEqual([]);
    });

    it('allows a nested tag with a slash', () => {
      expect(parseTaskLine('- [ ] Renew passport #todo/urgent')?.tags).toEqual(['todo/urgent']);
    });

    it('reports no tags when there are none', () => {
      expect(parseTaskLine('- [ ] Buy milk')?.tags).toEqual([]);
    });
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
    expect(formatTaskLine({ prefix: '- ', checkbox: ' ', title: 'Buy milk', tags: [], blockId: 'ots-a1' })).toBe(
      '- [ ] Buy milk ^ots-a1',
    );
  });

  it('leaves the line bare when there is no block id', () => {
    expect(formatTaskLine({ prefix: '- ', checkbox: 'x', title: 'Buy milk', tags: [], blockId: null })).toBe(
      '- [x] Buy milk',
    );
  });

  it('places tags between the title and the block id', () => {
    expect(
      formatTaskLine({
        prefix: '- ',
        checkbox: ' ',
        title: 'Renew passport',
        tags: ['errands', 'urgent'],
        blockId: 'ots-a1',
      }),
    ).toBe('- [ ] Renew passport #errands #urgent ^ots-a1');
  });

  it.each([
    '- [ ] Buy milk ^ots-a1',
    '    - [x] Nested and done ^ots-b2',
    '3. [ ] Numbered',
    '- [/] Tasks-plugin-style state ^ots-c3',
    '- [ ] Renew passport #errands #urgent ^ots-a1',
    '- [ ] Ask about #hashtags in general',
  ])('round trips %s unchanged', (line) => {
    const parsed = parseTaskLine(line);

    expect(parsed).not.toBeNull();
    expect(formatTaskLine(parsed!)).toBe(line);
  });
});

describe('isRepresentableAsTag', () => {
  it.each(['errands', 'todo/urgent', 'with-dash', 'with_underscore', 'CamelCase', '123'])(
    'accepts %s',
    (label) => {
      expect(isRepresentableAsTag(label)).toBe(true);
    },
  );

  it.each([
    ['with space', 'a Todoist label may contain a space, which Obsidian tag syntax cannot'],
    ['Ünïcode', 'a Todoist label may contain characters outside the ones a #tag can be written with'],
    ['', 'an empty label carries no text to write as a tag'],
  ])('rejects %s (%s)', (label) => {
    expect(isRepresentableAsTag(label)).toBe(false);
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
