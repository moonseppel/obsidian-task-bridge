import { LineGuard, NoteEdits, applyNoteEdits } from '../../../../services/sync/note-access/note-edits';

function noteEdits(edits: Partial<NoteEdits>): NoteEdits {
  return { replacements: [], removals: [], blocks: [], structure: [], appended: [], ...edits };
}

function guard(lines: readonly string[], lineNumber: number): LineGuard {
  return { lineNumber, expected: lines[lineNumber] };
}

function applied(lines: readonly string[], edits: Partial<NoteEdits>): string[] {
  return applyNoteEdits(lines.join('\n'), noteEdits(edits)).split('\n');
}

describe('applyNoteEdits insertions under a task', () => {
  it('lands after the task description and everything already nested under it', () => {
    const lines = ['- [ ] P', '\tNote', '\t- [ ] C', '- [ ] Next'];

    expect(applied(lines, { structure: [{ kind: 'insert-under', anchor: guard(lines, 0), lines: ['\t- [ ] New'] }] }))
      .toEqual(['- [ ] P', '\tNote', '\t- [ ] C', '\t- [ ] New', '- [ ] Next']);
  });

  it('keeps an insertion under a task nested inside another insertion anchor', () => {
    const lines = ['- [ ] P', '\t- [ ] C'];
    const structure = [
      { kind: 'insert-under' as const, anchor: guard(lines, 0), lines: ['\t- [ ] Under P'] },
      { kind: 'insert-under' as const, anchor: guard(lines, 1), lines: ['\t\t- [ ] Under C'] },
    ];

    expect(applied(lines, { structure })).toEqual(['- [ ] P', '\t- [ ] C', '\t\t- [ ] Under C', '\t- [ ] Under P']);
  });

  it('keeps a replaced line inside the subtree it inserts under', () => {
    const lines = ['- [ ] P', '\t- [ ] C'];

    expect(
      applied(lines, {
        replacements: [{ ...guard(lines, 1), replacement: '\t- [ ] C renamed' }],
        structure: [{ kind: 'insert-under', anchor: guard(lines, 0), lines: ['\t- [ ] New'] }],
      }),
    ).toEqual(['- [ ] P', '\t- [ ] C renamed', '\t- [ ] New']);
  });

  it('keeps a replaced description on the task it inserts under', () => {
    const lines = ['- [ ] P', '\tOld note'];

    expect(
      applied(lines, {
        blocks: [
          { taskLineNumber: 0, expectedTaskLine: '- [ ] P', startLine: 1, lineCount: 1, replacementLines: ['\tNew'] },
        ],
        structure: [{ kind: 'insert-under', anchor: guard(lines, 0), lines: ['\t- [ ] Child'] }],
      }),
    ).toEqual(['- [ ] P', '\tNew', '\t- [ ] Child']);
  });

  it('skips an insertion whose anchor no longer reads as expected', () => {
    const anchor = { lineNumber: 0, expected: '- [ ] P' };
    const edits = { structure: [{ kind: 'insert-under' as const, anchor, lines: ['\tX'] }] };

    expect(applied(['- [ ] Typed something else'], edits)).toEqual(['- [ ] Typed something else']);
  });
});

describe('applyNoteEdits moves under a new parent', () => {
  it('carries a task line and its subtree under the new parent, rebased onto its indentation', () => {
    const lines = ['- [ ] A', '\t- [ ] B', '\t\tNote', '- [ ] C'];

    expect(applied(lines, { structure: [{ kind: 'move-under', task: guard(lines, 1), newParent: guard(lines, 3) }] }))
      .toEqual(['- [ ] A', '- [ ] C', '\t- [ ] B', '\t\tNote']);
  });

  it('carries a replaced task line along', () => {
    const lines = ['- [ ] A', '- [ ] B', '\t- [ ] C'];

    expect(
      applied(lines, {
        replacements: [{ ...guard(lines, 2), replacement: '\t- [ ] C renamed' }],
        structure: [{ kind: 'move-under', task: guard(lines, 2), newParent: guard(lines, 0) }],
      }),
    ).toEqual(['- [ ] A', '\t- [ ] C renamed', '- [ ] B']);
  });

  it('carries a replaced description along', () => {
    const lines = ['- [ ] A', '- [ ] B', '\t- [ ] C', '\t\tOld'];

    expect(
      applied(lines, {
        blocks: [
          {
            taskLineNumber: 2,
            expectedTaskLine: '\t- [ ] C',
            startLine: 3,
            lineCount: 1,
            replacementLines: ['\t\tNew'],
          },
        ],
        structure: [{ kind: 'move-under', task: guard(lines, 2), newParent: guard(lines, 0) }],
      }),
    ).toEqual(['- [ ] A', '\t- [ ] C', '\t\tNew', '- [ ] B']);
  });

  it('moves a grandchild up under its grandparent exactly once', () => {
    const lines = ['- [ ] P', '\t- [ ] B', '\t\t- [ ] C'];

    expect(applied(lines, { structure: [{ kind: 'move-under', task: guard(lines, 2), newParent: guard(lines, 0) }] }))
      .toEqual(['- [ ] P', '\t- [ ] B', '\t- [ ] C']);
  });

  it('leaves a task in place when its new parent sits inside its own subtree', () => {
    const lines = ['- [ ] A', '\t- [ ] B'];

    expect(applied(lines, { structure: [{ kind: 'move-under', task: guard(lines, 0), newParent: guard(lines, 1) }] }))
      .toEqual(lines);
  });
});

describe('applyNoteEdits reindents in place', () => {
  it('rebases a task line and its subtree, keeping a replacement made to the task line', () => {
    const lines = ['- [ ] P', '\t- [ ] C', '\t\tNote'];

    expect(
      applied(lines, {
        replacements: [{ ...guard(lines, 1), replacement: '\t- [ ] C renamed' }],
        structure: [{ kind: 'reindent', task: guard(lines, 1), indent: '' }],
      }),
    ).toEqual(['- [ ] P', '- [ ] C renamed', '\tNote']);
  });
});
