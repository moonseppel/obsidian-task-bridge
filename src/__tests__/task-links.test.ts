import { TaskLink, TaskLinkStore } from '../services/sync/task-links';
import { Logger } from '../utils/logger';

function restored(stored: unknown): TaskLinkStore {
  const store = new TaskLinkStore();
  store.replaceAll(stored);

  return store;
}

const BARE = { blockId: 'tb-a1', providerTaskId: '6X', lastSyncedTitle: 'x' };

const LINK: TaskLink = {
  blockId: 'tb-a1',
  providerTaskId: '6X4Vw2Hfmg73Q2XR',
  lastSyncedTitle: 'Buy milk',
};

describe('TaskLinkStore', () => {
  it('finds a link by its block id', () => {
    expect(new TaskLinkStore([LINK]).get('tb-a1')).toEqual(LINK);
  });

  it('reports nothing for a block id it has never seen', () => {
    expect(new TaskLinkStore([LINK]).get('tb-unknown')).toBeUndefined();
  });

  it('replaces a link rather than storing the block id twice', () => {
    const store = new TaskLinkStore([LINK]);
    store.set({ ...LINK, lastSyncedTitle: 'Buy oat milk' });

    expect(store.size).toBe(1);
    expect(store.get('tb-a1')?.lastSyncedTitle).toBe('Buy oat milk');
  });

  it('forgets a link once it is deleted', () => {
    const store = new TaskLinkStore([LINK]);
    store.delete('tb-a1');

    expect(store.get('tb-a1')).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('does nothing when deleting a block id it never held', () => {
    const store = new TaskLinkStore([LINK]);
    store.delete('tb-unknown');

    expect(store.size).toBe(1);
  });

  it('iterates over every link it holds', () => {
    const other: TaskLink = { blockId: 'tb-b2', providerTaskId: 'other-task', lastSyncedTitle: 'Call the dentist' };

    expect([...new TaskLinkStore([LINK, other]).values()]).toEqual(expect.arrayContaining([LINK, other]));
  });

  it('round trips through its stored form', () => {
    expect(restored(new TaskLinkStore([LINK]).toStored()).get('tb-a1')).toEqual(LINK);
  });

  it.each<[unknown, string]>([
    [null, 'a missing value'],
    ['not an array', 'a string'],
    [{ blockId: 'tb-a1' }, 'an object rather than an array'],
  ])('starts empty when the stored value is %s', (stored) => {
    expect(restored(stored).size).toBe(0);
  });

  it.each<[unknown, string]>([
    [{ providerTaskId: '6X', lastSyncedTitle: 'x' }, 'no block id'],
    [{ blockId: 'tb-a1', lastSyncedTitle: 'x' }, 'no provider id'],
    [{ blockId: '', providerTaskId: '6X', lastSyncedTitle: 'x' }, 'an empty block id'],
    [{ blockId: 'tb-a1', providerTaskId: '6X' }, 'no last synced title'],
    [{ blockId: 'tb-a1', providerTaskId: 6, lastSyncedTitle: 'x' }, 'a numeric provider id'],
    [{ ...BARE, lastSyncedDone: 'yes' }, 'a non-boolean lastSyncedDone'],
    [{ ...BARE, lastSyncedDescription: 42 }, 'a non-string lastSyncedDescription'],
    [{ ...BARE, lastSyncedTags: 'errands' }, 'a non-array lastSyncedTags'],
    [{ ...BARE, lastSyncedTags: ['errands', 42] }, 'a lastSyncedTags array with a non-string entry'],
    [{ ...BARE, lastSyncedParentBlockId: '' }, 'an empty lastSyncedParentBlockId'],
    [{ ...BARE, lastSyncedParentBlockId: 42 }, 'a non-string lastSyncedParentBlockId'],
    ['a string', 'not an object at all'],
  ])('drops an entry with %s', (entry) => {
    expect(restored([entry]).size).toBe(0);
  });

  it('accepts a link with no lastSyncedDone, as a data.json written before feature 7 would have', () => {
    expect(restored([LINK]).get('tb-a1')?.lastSyncedDone).toBeUndefined();
  });

  it('accepts a link that carries a lastSyncedDone', () => {
    const link = { ...LINK, lastSyncedDone: true };

    expect(restored([link]).get('tb-a1')).toEqual(link);
  });

  it('accepts a link that carries a lastSyncedDescription', () => {
    const link = { ...LINK, lastSyncedDescription: 'Oat milk, not regular' };

    expect(restored([link]).get('tb-a1')).toEqual(link);
  });

  it('accepts a link that carries a lastSyncedTags', () => {
    const link = { ...LINK, lastSyncedTags: ['errands', 'urgent'] };

    expect(restored([link]).get('tb-a1')).toEqual(link);
  });

  it('accepts a link that carries a lastSyncedParentBlockId', () => {
    const link = { ...LINK, lastSyncedParentBlockId: 'tb-parent1' };

    expect(restored([link]).get('tb-a1')).toEqual(link);
  });

  it('keeps the sound entries when only some are malformed', () => {
    expect(restored([LINK, { blockId: 'tb-b2' }]).size).toBe(1);
  });
});

describe('TaskLinkStore restoring stored links', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('warns about stored entries it had to drop as unreadable', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    restored([BARE, { blockId: 'tb-b1' }]);

    expect(warn).toHaveBeenCalledWith('Dropped unreadable task links from the plugin data', { unreadable: 1 });
  });

  it('stays quiet when nothing was stored yet', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    restored(undefined);

    expect(warn).not.toHaveBeenCalled();
  });
});
