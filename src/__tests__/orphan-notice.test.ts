import { bareBlockIdDescription, orphanNoticeDescription, stripOrphanNotice } from '../services/sync/orphan-notice';

describe('orphanNoticeDescription', () => {
  it('names when the task was created and that it is now orphaned', () => {
    const description = orphanNoticeDescription('ots-a1b2c3d4', Date.parse('2026-01-15T00:00:00.000Z'));

    expect(description).toContain('Obsidian Task Sync');
    expect(description.toLowerCase()).toContain('orphaned');
    expect(description).toContain('2026-01-15');
  });

  it('still embeds the block id, so a re-link lookup keeps finding this task', () => {
    const description = orphanNoticeDescription('ots-a1b2c3d4', Date.now());

    expect(description).toContain('^ots-a1b2c3d4');
  });

  it('keeps whatever user-authored description text the task already carried', () => {
    const description = orphanNoticeDescription('ots-a1b2c3d4', Date.now(), 'Oat milk, not regular');

    expect(description).toContain('Oat milk, not regular');
    expect(description.toLowerCase()).toContain('orphaned');
  });
});

describe('bareBlockIdDescription', () => {
  it('is exactly what a freshly created task carries', () => {
    expect(bareBlockIdDescription('ots-a1b2c3d4')).toBe('Obsidian Task Sync ID: ^ots-a1b2c3d4');
  });

  it('puts user text above the footer when given one', () => {
    expect(bareBlockIdDescription('ots-a1b2c3d4', 'Oat milk')).toBe(
      'Oat milk\n\nObsidian Task Sync ID: ^ots-a1b2c3d4',
    );
  });
});

describe('stripOrphanNotice', () => {
  it('leaves text with no notice untouched', () => {
    expect(stripOrphanNotice('Oat milk, not regular')).toBe('Oat milk, not regular');
  });

  it('removes a bare notice entirely', () => {
    const notice = orphanNoticeDescription('ots-a1', Date.now());
    const withoutFooter = notice.replace(/\n\nObsidian Task Sync ID: \^ots-a1$/, '');

    expect(stripOrphanNotice(withoutFooter)).toBe('');
  });

  it('recovers user text placed before the notice, dropping the blank line between them', () => {
    const notice = orphanNoticeDescription('ots-a1', Date.now(), 'Oat milk, not regular');
    const withoutFooter = notice.replace(/\n\nObsidian Task Sync ID: \^ots-a1$/, '');

    expect(stripOrphanNotice(withoutFooter)).toBe('Oat milk, not regular');
  });
});
