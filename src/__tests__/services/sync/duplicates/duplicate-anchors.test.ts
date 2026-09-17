import { DuplicateAnchors } from '../../../../services/sync/duplicates/duplicate-anchors';
import { GracePeriod } from '../../../../services/sync/sync-state/grace-period';
import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';

const GRACE_MS = 60_000;

function anchors(links: TaskLinkStore = new TaskLinkStore()): DuplicateAnchors {
  return new DuplicateAnchors(links, new GracePeriod(GRACE_MS));
}

describe('DuplicateAnchors', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls the first line carrying an id its keeper and every later one a copy', () => {
    const duplicates = anchors();

    duplicates.startRun();

    expect(duplicates.noteOccurrence('tb-a1', 'A.md', 0)).toBe('keeper');
    expect(duplicates.noteOccurrence('tb-a1', 'B.md', 3)).toBe('copy');
    expect(duplicates.noteOccurrence('tb-b2', 'B.md', 4)).toBe('keeper');
  });

  it('keeps the id with the file the link last knew it in, whatever order the run reads them', () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: 'task-1', lastSyncedTitle: 'Buy milk', lastKnownFilePath: 'B.md' },
    ]);
    const duplicates = anchors(links);

    duplicates.startRun();
    duplicates.noteOccurrence('tb-a1', 'A.md', 0);
    duplicates.noteOccurrence('tb-a1', 'B.md', 0);
    duplicates.endRun();
    jest.advanceTimersByTime(GRACE_MS + 1);

    duplicates.startRun();

    expect(duplicates.noteOccurrence('tb-a1', 'A.md', 0)).toBe('copy');
    expect(duplicates.noteOccurrence('tb-a1', 'B.md', 0)).toBe('keeper');
    expect(duplicates.endRun()).toEqual([
      { blockId: 'tb-a1', keeper: { path: 'B.md', lineNumber: 0 }, copies: [{ path: 'A.md', lineNumber: 0 }] },
    ]);
  });

  it('falls back to scan order when the link names no file, or one the id is not in', () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: 'task-1', lastSyncedTitle: 'Buy milk', lastKnownFilePath: 'Gone.md' },
    ]);
    const duplicates = anchors(links);

    duplicates.startRun();
    duplicates.noteOccurrence('tb-a1', 'A.md', 0);
    duplicates.noteOccurrence('tb-a1', 'B.md', 0);
    duplicates.endRun();
    jest.advanceTimersByTime(GRACE_MS + 1);

    duplicates.startRun();
    duplicates.noteOccurrence('tb-a1', 'A.md', 0);
    duplicates.noteOccurrence('tb-a1', 'B.md', 0);

    expect(duplicates.endRun()).toEqual([
      { blockId: 'tb-a1', keeper: { path: 'A.md', lineNumber: 0 }, copies: [{ path: 'B.md', lineNumber: 0 }] },
    ]);
  });

  it('keeps the first of two lines carrying the same id in one file', () => {
    jest.useFakeTimers();
    const duplicates = anchors();

    duplicates.startRun();
    duplicates.noteOccurrence('tb-a1', 'A.md', 2);
    duplicates.noteOccurrence('tb-a1', 'A.md', 7);
    duplicates.endRun();
    jest.advanceTimersByTime(GRACE_MS + 1);

    duplicates.startRun();

    expect(duplicates.noteOccurrence('tb-a1', 'A.md', 2)).toBe('keeper');
    expect(duplicates.noteOccurrence('tb-a1', 'A.md', 7)).toBe('copy');
    expect(duplicates.endRun()).toEqual([
      { blockId: 'tb-a1', keeper: { path: 'A.md', lineNumber: 2 }, copies: [{ path: 'A.md', lineNumber: 7 }] },
    ]);
  });

  it('hands back nothing while the duplicate is still waiting out its grace period', () => {
    const duplicates = anchors();

    duplicates.startRun();
    duplicates.noteOccurrence('tb-a1', 'A.md', 0);
    duplicates.noteOccurrence('tb-a1', 'B.md', 0);

    expect(duplicates.endRun()).toEqual([]);
  });

  it('forgets an id once a single line carries it again, and starts its grace over if it returns', () => {
    jest.useFakeTimers();
    const duplicates = anchors();

    duplicates.startRun();
    duplicates.noteOccurrence('tb-a1', 'A.md', 0);
    duplicates.noteOccurrence('tb-a1', 'B.md', 0);
    duplicates.endRun();
    jest.advanceTimersByTime(GRACE_MS + 1);

    duplicates.startRun();
    duplicates.noteOccurrence('tb-a1', 'A.md', 0);
    duplicates.endRun();

    duplicates.startRun();

    expect(duplicates.noteOccurrence('tb-a1', 'A.md', 0)).toBe('keeper');
    expect(duplicates.noteOccurrence('tb-a1', 'B.md', 0)).toBe('copy');
    expect(duplicates.endRun()).toEqual([]);
  });
});
