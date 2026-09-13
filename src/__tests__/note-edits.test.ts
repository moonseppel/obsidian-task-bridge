import { NoteEdits, applyNoteEdits } from '../services/sync/note-edits';

function noteEdits(edits: Partial<NoteEdits>): NoteEdits {
  return { replacements: [], removals: [], blocks: [], appended: [], ...edits };
}

describe('applyNoteEdits replacements', () => {
  it('replaces a line that still reads as expected', () => {
    const edits = noteEdits({
      replacements: [{ lineNumber: 1, expected: '- [ ] Second', replacement: '- [ ] Changed' }],
    });

    expect(applyNoteEdits('- [ ] First\n- [ ] Second', edits)).toBe('- [ ] First\n- [ ] Changed');
  });

  it('leaves a line the user edited in the meantime untouched', () => {
    const edits = noteEdits({
      replacements: [{ lineNumber: 0, expected: '- [ ] Old', replacement: '- [ ] New' }],
    });

    expect(applyNoteEdits('- [ ] Typed something else', edits)).toBe('- [ ] Typed something else');
  });

  it('ignores an edit pointing past the end of the note', () => {
    const edits = noteEdits({
      replacements: [{ lineNumber: 9, expected: '- [ ] Gone', replacement: '- [ ] New' }],
    });

    expect(applyNoteEdits('- [ ] Only line', edits)).toBe('- [ ] Only line');
  });
});

describe('applyNoteEdits removals', () => {
  it('drops a line that still reads as expected', () => {
    const edits = noteEdits({ removals: [{ lineNumber: 1, expected: '- [ ] Second' }] });

    expect(applyNoteEdits('- [ ] First\n- [ ] Second\n- [ ] Third', edits)).toBe('- [ ] First\n- [ ] Third');
  });

  it('leaves a line the user edited in the meantime untouched', () => {
    const edits = noteEdits({ removals: [{ lineNumber: 0, expected: '- [ ] Old' }] });

    expect(applyNoteEdits('- [ ] Typed something else', edits)).toBe('- [ ] Typed something else');
  });

  it('drops several lines by index in one call', () => {
    const edits = noteEdits({
      removals: [
        { lineNumber: 0, expected: '- [ ] First' },
        { lineNumber: 2, expected: '- [ ] Third' },
      ],
    });

    expect(applyNoteEdits('- [ ] First\n- [ ] Second\n- [ ] Third', edits)).toBe('- [ ] Second');
  });

  it('leaves the note empty when its only line is removed', () => {
    const edits = noteEdits({ removals: [{ lineNumber: 0, expected: '- [ ] Only line' }] });

    expect(applyNoteEdits('- [ ] Only line', edits)).toBe('');
  });
});

describe('applyNoteEdits appends', () => {
  it('adds a new line at the end of a non-empty note', () => {
    expect(applyNoteEdits('- [ ] First', noteEdits({ appended: ['- [ ] Second'] }))).toBe(
      '- [ ] First\n- [ ] Second',
    );
  });

  it('does not leave a leading blank line when the note started empty', () => {
    expect(applyNoteEdits('', noteEdits({ appended: ['- [ ] First'] }))).toBe('- [ ] First');
  });

  it('leaves the note untouched when there is nothing to append', () => {
    expect(applyNoteEdits('- [ ] First', noteEdits({ appended: [] }))).toBe('- [ ] First');
  });
});

describe('applyNoteEdits', () => {
  it('applies replacements, removals and appends together', () => {
    const edits: NoteEdits = {
      replacements: [{ lineNumber: 0, expected: '- [ ] First', replacement: '- [ ] First edited' }],
      removals: [{ lineNumber: 1, expected: '- [ ] Second' }],
      blocks: [],
      appended: ['- [ ] Third'],
    };

    expect(applyNoteEdits('- [ ] First\n- [ ] Second', edits)).toBe('- [ ] First edited\n- [ ] Third');
  });

  it('does nothing when every list is empty', () => {
    const edits: NoteEdits = { replacements: [], removals: [], blocks: [], appended: [] };

    expect(applyNoteEdits('- [ ] Only line', edits)).toBe('- [ ] Only line');
  });

  it('inserts a new block under a task line where none existed', () => {
    const edits: NoteEdits = {
      replacements: [],
      removals: [],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 0,
          replacementLines: ['\tOat milk'],
        },
      ],
      appended: [],
    };

    expect(applyNoteEdits('- [ ] Buy milk\n- [ ] Second', edits)).toBe(
      '- [ ] Buy milk\n\tOat milk\n- [ ] Second',
    );
  });

  it('replaces an existing block with a shorter one', () => {
    const edits: NoteEdits = {
      replacements: [],
      removals: [],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 2,
          replacementLines: ['\tJust one line now'],
        },
      ],
      appended: [],
    };

    expect(applyNoteEdits('- [ ] Buy milk\n\tOld line one\n\tOld line two\n- [ ] Second', edits)).toBe(
      '- [ ] Buy milk\n\tJust one line now\n- [ ] Second',
    );
  });

  it('replaces an existing block with a longer one', () => {
    const edits: NoteEdits = {
      replacements: [],
      removals: [],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 1,
          replacementLines: ['\tFirst', '\tSecond', '\tThird'],
        },
      ],
      appended: [],
    };

    expect(applyNoteEdits('- [ ] Buy milk\n\tOld line\n- [ ] Second', edits)).toBe(
      '- [ ] Buy milk\n\tFirst\n\tSecond\n\tThird\n- [ ] Second',
    );
  });

  it('skips a block edit whose anchor task line no longer matches, like every other edit kind', () => {
    const edits: NoteEdits = {
      replacements: [],
      removals: [],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 0,
          replacementLines: ['\tOat milk'],
        },
      ],
      appended: [],
    };

    expect(applyNoteEdits('- [ ] Typed something else', edits)).toBe('- [ ] Typed something else');
  });

  it('combines a block edit with an unrelated replacement and removal in the same commit without corruption', () => {
    const edits: NoteEdits = {
      replacements: [{ lineNumber: 0, expected: '- [ ] Buy milk', replacement: '- [ ] Buy oat milk' }],
      removals: [{ lineNumber: 2, expected: '- [ ] Third' }],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 0,
          replacementLines: ['\tOat milk, not regular'],
        },
      ],
      appended: [],
    };

    expect(
      applyNoteEdits('- [ ] Buy milk\n- [ ] Second\n- [ ] Third', edits),
    ).toBe('- [ ] Buy oat milk\n\tOat milk, not regular\n- [ ] Second');
  });
});
