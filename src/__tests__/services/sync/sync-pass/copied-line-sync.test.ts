import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import {
  FakeNote,
  PROJECT,
  TASK_ID,
  makeMultiFileSync,
  projectExists,
  remoteTasks,
} from '../../../support/sync-harness';

const GRACE_MS = 60_000;

describe('TaskSync with a task line copied to a second place', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('pushes the keeper line once and never lets the copy push the stale title back', async () => {
    const keeper = new FakeNote('- [ ] Bar ^tb-a1');
    const copy = new FakeNote('- [ ] Foo ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Foo', lastKnownFilePath: 'Keeper.md' },
    ]);
    let remoteTitle = 'Foo';
    const updateTaskTitle = jest.fn(async (_taskId: string, title: string) => {
      remoteTitle = title;
    });
    const sync = makeMultiFileSync(
      new Map([
        ['Copy.md', copy],
        ['Keeper.md', keeper],
      ]),
      links,
      { listTasks: () => Promise.resolve([{ id: TASK_ID, title: remoteTitle }]), updateTaskTitle },
    );

    await sync.run(PROJECT);
    await sync.run(PROJECT);

    expect(updateTaskTitle.mock.calls).toEqual([[TASK_ID, 'Bar']]);

    await sync.run(PROJECT);

    expect(updateTaskTitle).toHaveBeenCalledTimes(1);
    expect(keeper.content).toBe('- [ ] Bar ^tb-a1');
    expect(copy.content).toBe('- [ ] Foo ^tb-a1');
  });

  it('leaves the last known file on the keeper rather than flipping it to the copy', async () => {
    const keeper = new FakeNote('- [ ] Buy milk ^tb-a1');
    const copy = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastKnownFilePath: 'Keeper.md' },
    ]);
    const sync = makeMultiFileSync(
      new Map([
        ['Copy.md', copy],
        ['Keeper.md', keeper],
      ]),
      links,
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }) },
    );

    await sync.run(PROJECT);
    await sync.run(PROJECT);
    await sync.run(PROJECT);

    expect(links.get('tb-a1')?.lastKnownFilePath).toBe('Keeper.md');
  });

  it('syncs only the first of two lines carrying the same id in one note', async () => {
    const note = new FakeNote('- [ ] Buy milk ^tb-a1\n- [ ] Buy oat milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Groceries' },
    ]);
    const updateTaskTitle = jest.fn(async () => undefined);
    const sync = makeMultiFileSync(new Map([['Tasks.md', note]]), links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Groceries' }),
      updateTaskTitle,
    });

    await sync.run(PROJECT);

    expect(updateTaskTitle).toHaveBeenCalledTimes(1);
    expect(updateTaskTitle).toHaveBeenCalledWith(TASK_ID, 'Buy milk');
    expect(note.content).toBe('- [ ] Buy milk ^tb-a1\n- [ ] Buy oat milk ^tb-a1');
  });

  it('does not count a line the tag filter excludes as carrying the id at all', async () => {
    jest.useFakeTimers();
    const inScope = new FakeNote('- [ ] Buy milk #work ^tb-a1');
    const outOfScope = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Groceries', lastKnownFilePath: 'Work.md' },
    ]);
    const updateTaskTitle = jest.fn(async () => undefined);
    const sync = makeMultiFileSync(
      new Map([
        ['Personal.md', outOfScope],
        ['Work.md', inScope],
      ]),
      links,
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Groceries' }),
        listProjects: projectExists,
        updateTaskTitle,
        updateTaskLabels: async () => undefined,
      },
      { isTagInScope: (task) => task.tags.includes('work') },
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(GRACE_MS + 1);
    await sync.run(PROJECT);

    expect(updateTaskTitle).toHaveBeenCalledWith(TASK_ID, 'Buy milk');
    expect(outOfScope.content).toBe('- [ ] Buy milk ^tb-a1');
  });
});
