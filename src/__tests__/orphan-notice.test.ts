import { orphanNoticeDescription, stripOrphanNotice } from '../services/sync/orphan-notice';

describe('orphanNoticeDescription', () => {
  it('names when the task was created and that it is now orphaned', () => {
    const description = orphanNoticeDescription('tb-a1b2c3d4', Date.parse('2026-01-15T00:00:00.000Z'));

    expect(description).toContain('TaskBridge');
    expect(description.toLowerCase()).toContain('orphaned');
    expect(description).toContain('2026-01-15');
  });

  it('still embeds the block id, so a re-link lookup keeps finding this task', () => {
    const description = orphanNoticeDescription('tb-a1b2c3d4', Date.now());

    expect(description).toContain('^tb-a1b2c3d4');
  });

  it('keeps whatever user-authored description text the task already carried', () => {
    const description = orphanNoticeDescription('tb-a1b2c3d4', Date.now(), 'Oat milk, not regular');

    expect(description).toContain('Oat milk, not regular');
    expect(description.toLowerCase()).toContain('orphaned');
  });
});

describe('stripOrphanNotice', () => {
  it('leaves text with no notice untouched', () => {
    expect(stripOrphanNotice('Oat milk, not regular')).toBe('Oat milk, not regular');
  });

  it('removes a bare notice entirely', () => {
    const notice = orphanNoticeDescription('tb-a1', Date.now());
    const withoutFooter = notice.replace(/\n\nTaskBridge ID: \^tb-a1$/, '');

    expect(stripOrphanNotice(withoutFooter)).toBe('');
  });

  it('recovers user text placed before the notice, dropping the blank line between them', () => {
    const notice = orphanNoticeDescription('tb-a1', Date.now(), 'Oat milk, not regular');
    const withoutFooter = notice.replace(/\n\nTaskBridge ID: \^tb-a1$/, '');

    expect(stripOrphanNotice(withoutFooter)).toBe('Oat milk, not regular');
  });
});
