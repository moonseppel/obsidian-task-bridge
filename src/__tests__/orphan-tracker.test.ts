import { OrphanTracker } from '../services/sync/orphan-tracker';

describe('OrphanTracker', () => {
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

    const restored = OrphanTracker.fromStored(orphans.toStored());

    expect(restored.get('t1')).toEqual({ providerTaskId: 't1', firstSeenOrphanedAt: 1_000 });
  });

  it('drops a malformed record rather than trusting it', () => {
    const orphans = OrphanTracker.fromStored([{ providerTaskId: '', firstSeenOrphanedAt: 1_000 }, 'nonsense']);

    expect(orphans.size).toBe(0);
  });

  it('replaceAll keeps the same instance, so existing holders see the new records', () => {
    const orphans = new OrphanTracker();
    orphans.track('stale', 1_000);

    orphans.replaceAll([{ providerTaskId: 't1', firstSeenOrphanedAt: 2_000 }]);

    expect(orphans.get('stale')).toBeUndefined();
    expect(orphans.get('t1')).toEqual({ providerTaskId: 't1', firstSeenOrphanedAt: 2_000 });
  });
});
