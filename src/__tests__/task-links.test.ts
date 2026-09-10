import { TaskLink, TaskLinkStore } from '../services/sync/task-links';

const LINK: TaskLink = {
  blockId: 'ots-a1',
  providerTaskId: '6X4Vw2Hfmg73Q2XR',
  lastSyncedTitle: 'Buy milk',
};

describe('TaskLinkStore', () => {
  it('finds a link by its block id', () => {
    expect(new TaskLinkStore([LINK]).get('ots-a1')).toEqual(LINK);
  });

  it('reports nothing for a block id it has never seen', () => {
    expect(new TaskLinkStore([LINK]).get('ots-unknown')).toBeUndefined();
  });

  it('replaces a link rather than storing the block id twice', () => {
    const store = new TaskLinkStore([LINK]);
    store.set({ ...LINK, lastSyncedTitle: 'Buy oat milk' });

    expect(store.size).toBe(1);
    expect(store.get('ots-a1')?.lastSyncedTitle).toBe('Buy oat milk');
  });

  it('round trips through its stored form', () => {
    expect(TaskLinkStore.fromStored(new TaskLinkStore([LINK]).toStored()).get('ots-a1')).toEqual(LINK);
  });

  it.each<[unknown, string]>([
    [null, 'a missing value'],
    ['not an array', 'a string'],
    [{ blockId: 'ots-a1' }, 'an object rather than an array'],
  ])('starts empty when the stored value is %s', (stored) => {
    expect(TaskLinkStore.fromStored(stored).size).toBe(0);
  });

  it.each<[unknown, string]>([
    [{ providerTaskId: '6X', lastSyncedTitle: 'x' }, 'no block id'],
    [{ blockId: 'ots-a1', lastSyncedTitle: 'x' }, 'no provider id'],
    [{ blockId: '', providerTaskId: '6X', lastSyncedTitle: 'x' }, 'an empty block id'],
    [{ blockId: 'ots-a1', providerTaskId: '6X' }, 'no last synced title'],
    [{ blockId: 'ots-a1', providerTaskId: 6, lastSyncedTitle: 'x' }, 'a numeric provider id'],
    ['a string', 'not an object at all'],
  ])('drops an entry with %s', (entry) => {
    expect(TaskLinkStore.fromStored([entry]).size).toBe(0);
  });

  it('keeps the sound entries when only some are malformed', () => {
    expect(TaskLinkStore.fromStored([LINK, { blockId: 'ots-b2' }]).size).toBe(1);
  });
});
