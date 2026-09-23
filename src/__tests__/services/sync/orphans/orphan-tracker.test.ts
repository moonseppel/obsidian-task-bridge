import { OrphanTracker } from '../../../../services/sync/orphans/orphan-tracker';

function restored(stored: unknown): OrphanTracker {
  const orphans = new OrphanTracker();
  orphans.replaceAll(stored);

  return orphans;
}

import { Logger } from '../../../../utils/logger';

describe('OrphanTracker', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('tracks a task the first time it is observed orphaned', () => {
    const orphans = new OrphanTracker();

    orphans.track('t1', 1_000);

    expect(orphans.get('t1')).toEqual({ providerTaskId: 't1', firstSeenOrphanedAt: 1_000 });
  });

  it('keeps the original time rather than resetting it on a later sighting', () => {
    const orphans = new OrphanTracker();

    orphans.track('t1', 1_000);
    orphans.track('t1', 2_000);

    expect(orphans.get('t1')?.firstSeenOrphanedAt).toBe(1_000);
  });

  it('records the removal date decided for an already-tracked orphan', () => {
    const orphans = new OrphanTracker();
    orphans.track('t1', 1_000);

    orphans.flag('t1', 5_000);

    expect(orphans.get('t1')).toEqual({ providerTaskId: 't1', firstSeenOrphanedAt: 1_000, removalDueAt: 5_000 });
  });

  it('does nothing when flagging a task that is not tracked', () => {
    const orphans = new OrphanTracker();

    orphans.flag('t1', 5_000);

    expect(orphans.get('t1')).toBeUndefined();
  });

  it('drops tracking for a task not given to keepOnly', () => {
    const orphans = new OrphanTracker();
    orphans.track('t1', 1_000);
    orphans.track('t2', 1_000);

    orphans.keepOnly(new Set(['t2']));

    expect(orphans.get('t1')).toBeUndefined();
    expect(orphans.get('t2')).toBeDefined();
  });

  it('round-trips through stored data', () => {
    const orphans = new OrphanTracker();
    orphans.track('t1', 1_000);

    const reloaded = restored(orphans.toStored());

    expect(reloaded.get('t1')).toEqual({ providerTaskId: 't1', firstSeenOrphanedAt: 1_000 });
  });

  it('drops a malformed record rather than trusting it', () => {
    const orphans = restored([{ providerTaskId: '', firstSeenOrphanedAt: 1_000 }, 'nonsense']);

    expect(orphans.size).toBe(0);
  });

  it('drops a record whose removal date is the wrong type', () => {
    const orphans = restored([
      { providerTaskId: 't1', firstSeenOrphanedAt: 1_000, removalDueAt: 'soon' },
    ]);

    expect(orphans.size).toBe(0);
  });

  it('round-trips a flagged record through stored data', () => {
    const orphans = new OrphanTracker();
    orphans.track('t1', 1_000);
    orphans.flag('t1', 5_000);

    const reloaded = restored(orphans.toStored());

    expect(reloaded.get('t1')).toEqual({ providerTaskId: 't1', firstSeenOrphanedAt: 1_000, removalDueAt: 5_000 });
  });

  it('replaceAll keeps the same instance, so existing holders see the new records', () => {
    const orphans = new OrphanTracker();
    orphans.track('stale', 1_000);

    orphans.replaceAll([{ providerTaskId: 't1', firstSeenOrphanedAt: 2_000 }]);

    expect(orphans.get('stale')).toBeUndefined();
    expect(orphans.get('t1')).toEqual({ providerTaskId: 't1', firstSeenOrphanedAt: 2_000 });
  });
});
