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

  it('forgets a link once it is deleted', () => {
    const store = new TaskLinkStore([LINK]);
    store.delete('ots-a1');

    expect(store.get('ots-a1')).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('does nothing when deleting a block id it never held', () => {
    const store = new TaskLinkStore([LINK]);
    store.delete('ots-unknown');

    expect(store.size).toBe(1);
  });

  it('iterates over every link it holds', () => {
    const other: TaskLink = { blockId: 'ots-b2', providerTaskId: 'other-task', lastSyncedTitle: 'Call the dentist' };

    expect([...new TaskLinkStore([LINK, other]).values()]).toEqual(expect.arrayContaining([LINK, other]));
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
    [{ blockId: 'ots-a1', providerTaskId: '6X', lastSyncedTitle: 'x', lastSyncedDone: 'yes' }, 'a non-boolean lastSyncedDone'],
    ['a string', 'not an object at all'],
  ])('drops an entry with %s', (entry) => {
    expect(TaskLinkStore.fromStored([entry]).size).toBe(0);
  });

  it('accepts a link with no lastSyncedDone, as a data.json written before feature 7 would have', () => {
    expect(TaskLinkStore.fromStored([LINK]).get('ots-a1')?.lastSyncedDone).toBeUndefined();
  });

  it('accepts a link that carries a lastSyncedDone', () => {
    const link = { ...LINK, lastSyncedDone: true };

    expect(TaskLinkStore.fromStored([link]).get('ots-a1')).toEqual(link);
  });

  it('keeps the sound entries when only some are malformed', () => {
    expect(TaskLinkStore.fromStored([LINK, { blockId: 'ots-b2' }]).size).toBe(1);
  });
});
