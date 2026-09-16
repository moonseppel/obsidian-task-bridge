import {
  collectBlockIds,
  formatTaskLine,
  isDone,
  isRepresentableAsTag,
  parseTaskLine,
  taskLineFrom,
  withTags,
  withTitle,
} from '../services/sync/task-line';

describe('parseTaskLine', () => {
  it.each([
    ['- [ ] Buy milk', '- ', 'Buy milk'],
    ['* [ ] Buy milk', '* ', 'Buy milk'],
    ['+ [ ] Buy milk', '+ ', 'Buy milk'],
    ['1. [ ] Buy milk', '1. ', 'Buy milk'],
    ['2) [ ] Buy milk', '2) ', 'Buy milk'],
  ])('recognises %s as a task', (line, prefix, title) => {
    expect(parseTaskLine(line)).toEqual({ prefix, checkbox: ' ', text: title, title, tags: [], blockId: undefined });
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
      text: 'Buy milk',
      title: 'Buy milk',
      tags: [],
      blockId: 'ots-a1b2c3',
    });
  });

  it('takes the last caret as the block id and leaves earlier ones in the title', () => {
    expect(parseTaskLine('- [ ] Read ^chapter ^ots-a1')).toEqual({
      prefix: '- ',
      checkbox: ' ',
      text: 'Read ^chapter',
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
    expect(parseTaskLine(line)).toBeUndefined();
  });

  describe('tags', () => {
    it('splits a single trailing tag off the title', () => {
      expect(parseTaskLine('- [ ] Renew passport #errands')).toEqual({
        prefix: '- ',
        checkbox: ' ',
        text: 'Renew passport #errands',
        title: 'Renew passport',
        tags: ['errands'],
        blockId: undefined,
      });
    });

    it('splits multiple trailing tags off the title, in order', () => {
      expect(parseTaskLine('- [ ] Renew passport #errands #urgent')?.tags).toEqual(['errands', 'urgent']);
    });

    it('finds trailing tags before the block id', () => {
      expect(parseTaskLine('- [ ] Renew passport #errands #urgent ^ots-a1')).toEqual({
        prefix: '- ',
        checkbox: ' ',
        text: 'Renew passport #errands #urgent',
        title: 'Renew passport',
        tags: ['errands', 'urgent'],
        blockId: 'ots-a1',
      });
    });

    it('reads a tag in the middle of the text, taking it out of the title with one space', () => {
      const task = parseTaskLine('- [ ] Call the #home dentist ^ots-a1');

      expect(task?.title).toBe('Call the dentist');
      expect(task?.tags).toEqual(['home']);
      expect(task?.text).toBe('Call the #home dentist');
    });

    it('reads a tag opening the text', () => {
      const task = parseTaskLine('- [ ] #home Call the dentist');

      expect(task?.title).toBe('Call the dentist');
      expect(task?.tags).toEqual(['home']);
    });

    it('reads several tags across one line, in the order they stand there', () => {
      const task = parseTaskLine('- [ ] #home Call the #urgent dentist #errands ^ots-a1');

      expect(task?.title).toBe('Call the dentist');
      expect(task?.tags).toEqual(['home', 'urgent', 'errands']);
    });

    it('keeps the spacing of the text a removed tag stood in', () => {
      expect(parseTaskLine('- [ ] Call  the #home  dentist')?.title).toBe('Call  the  dentist');
    });

    it('reads a tag standing directly before the block id anchor', () => {
      const task = parseTaskLine('- [ ] Call the dentist #home ^ots-a1');

      expect(task?.title).toBe('Call the dentist');
      expect(task?.tags).toEqual(['home']);
    });

    it.each([
      ['- [ ] Learn C# properly', 'a # glued to the word before it'],
      ['- [ ] Read example.com/#section', 'a URL fragment'],
      ['- [ ] Ask about `#hashtags` in general', 'a # inside an inline-code span'],
      ['- [ ] Pay invoice #123', 'a run of digits alone'],
    ])('leaves %s alone (%s)', (line) => {
      const task = parseTaskLine(line);

      expect(task?.tags).toEqual([]);
      expect(task?.title).toBe(line.slice('- [ ] '.length));
    });

    it('allows a nested tag with a slash', () => {
      expect(parseTaskLine('- [ ] Renew passport #todo/urgent')?.tags).toEqual(['todo/urgent']);
    });

    it('reports no tags when there are none', () => {
      expect(parseTaskLine('- [ ] Buy milk')?.tags).toEqual([]);
    });

    it.each(['büro', 'wortschöpfung', '日本語', 'tag/sub', 'with-dash', 'with_underscore', '🎉', '1a'])(
      'reads #%s as a tag',
      (tag) => {
        expect(parseTaskLine(`- [ ] Renew passport #${tag}`)?.tags).toEqual([tag]);
      },
    );

    it('leaves a run of digits as ordinary text, the way Obsidian reads it', () => {
      const task = parseTaskLine('- [ ] Pay invoice #123');

      expect(task?.title).toBe('Pay invoice #123');
      expect(task?.tags).toEqual([]);
    });

    it('reads the tags of a line that also carries a non-tag #', () => {
      const task = parseTaskLine('- [ ] Pay invoice #123 #errands');

      expect(task?.title).toBe('Pay invoice #123');
      expect(task?.tags).toEqual(['errands']);
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
    expect(
      formatTaskLine(taskLineFrom({ prefix: '- ', checkbox: ' ', text: 'Buy milk', blockId: 'ots-a1' })),
    ).toBe('- [ ] Buy milk ^ots-a1');
  });

  it('leaves the line bare when there is no block id', () => {
    expect(
      formatTaskLine(taskLineFrom({ prefix: '- ', checkbox: 'x', text: 'Buy milk', blockId: undefined })),
    ).toBe('- [x] Buy milk');
  });

  it('places tags between the title and the block id', () => {
    expect(
      formatTaskLine(
        taskLineFrom({
          prefix: '- ',
          checkbox: ' ',
          text: 'Renew passport #errands #urgent',
          blockId: 'ots-a1',
        }),
      ),
    ).toBe('- [ ] Renew passport #errands #urgent ^ots-a1');
  });

  it.each([
    '- [ ] Buy milk ^ots-a1',
    '    - [x] Nested and done ^ots-b2',
    '3. [ ] Numbered',
    '- [/] Tasks-plugin-style state ^ots-c3',
    '- [ ] Renew passport #errands #urgent ^ots-a1',
    '- [ ] Call the #home dentist ^ots-a1',
    '- [ ] Ask about `#hashtags` in general',
    '- [ ] Renew passport #büro ^ots-a1',
    '- [ ] Renew passport #tag/sub',
    '- [ ] Pay invoice #123',
  ])('round trips %s unchanged', (line) => {
    const parsed = parseTaskLine(line);

    expect(parsed).not.toBeUndefined();
    expect(formatTaskLine(parsed!)).toBe(line);
  });
});

describe('taskLineFrom', () => {
  it('reads the title and the tags out of the text it is given', () => {
    expect(taskLineFrom({ prefix: '- ', checkbox: ' ', text: 'Renew passport #errands', blockId: undefined })).toEqual({
      prefix: '- ',
      checkbox: ' ',
      text: 'Renew passport #errands',
      title: 'Renew passport',
      tags: ['errands'],
      blockId: undefined,
    });
  });
});

describe('withTitle', () => {
  it('rewrites the text as the new title followed by the tags it had', () => {
    const task = parseTaskLine('- [ ] Renew passport #errands #urgent ^ots-a1')!;

    expect(formatTaskLine(withTitle(task, 'Renew the passport'))).toBe(
      '- [ ] Renew the passport #errands #urgent ^ots-a1',
    );
  });

  it('leaves a line without tags as the bare title', () => {
    const task = parseTaskLine('- [ ] Renew passport ^ots-a1')!;

    expect(formatTaskLine(withTitle(task, 'Renew the passport'))).toBe('- [ ] Renew the passport ^ots-a1');
  });

  it('moves a tag that stood inside the replaced text to the trailing position', () => {
    const task = parseTaskLine('- [ ] Call the #home dentist ^ots-a1')!;

    expect(formatTaskLine(withTitle(task, 'Book a check-up'))).toBe('- [ ] Book a check-up #home ^ots-a1');
  });
});

describe('withTags', () => {
  it('replaces the tags on the line, keeping its title', () => {
    const task = parseTaskLine('- [ ] Renew passport #errands ^ots-a1')!;

    expect(formatTaskLine(withTags(task, ['urgent']))).toBe('- [ ] Renew passport #urgent ^ots-a1');
  });

  it('leaves the bare title behind when every tag is taken away', () => {
    const task = parseTaskLine('- [ ] Renew passport #errands ^ots-a1')!;

    expect(formatTaskLine(withTags(task, []))).toBe('- [ ] Renew passport ^ots-a1');
  });

  it('takes a tag out of the middle of the text where it stands, with one adjoining space', () => {
    const task = parseTaskLine('- [ ] Call the #home dentist ^ots-a1')!;

    expect(formatTaskLine(withTags(task, []))).toBe('- [ ] Call the dentist ^ots-a1');
  });

  it('leaves the tags it keeps where they stand and appends only the new one', () => {
    const task = parseTaskLine('- [ ] Call the #home dentist ^ots-a1')!;

    expect(formatTaskLine(withTags(task, ['home', 'urgent']))).toBe('- [ ] Call the #home dentist #urgent ^ots-a1');
  });

  it('takes one tag out in place while appending another', () => {
    const task = parseTaskLine('- [ ] #home Call the #urgent dentist ^ots-a1')!;

    expect(formatTaskLine(withTags(task, ['home', 'errands']))).toBe('- [ ] #home Call the dentist #errands ^ots-a1');
  });
});

describe('isRepresentableAsTag', () => {
  it.each(['errands', 'todo/urgent', 'with-dash', 'with_underscore', 'CamelCase', 'Ünïcode', '日本語', '🎉', '1a'])(
    'accepts %s',
    (label) => {
      expect(isRepresentableAsTag(label)).toBe(true);
    },
  );

  it.each([
    ['with space', 'a Todoist label may contain a space, which Obsidian tag syntax cannot'],
    ['exclaim!', 'a Todoist label may contain punctuation no #tag can be written with'],
    ['123', 'Obsidian reads a run of digits alone as a number rather than a tag'],
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
