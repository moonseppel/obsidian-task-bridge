import { bareBlockIdDescription, orphanNoticeDescription } from '../services/sync/orphan-notice';

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
});

describe('bareBlockIdDescription', () => {
  it('is exactly what a freshly created task carries', () => {
    expect(bareBlockIdDescription('ots-a1b2c3d4')).toBe('^ots-a1b2c3d4');
  });
});
