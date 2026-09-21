import { OrphanTracker } from '../../../../services/sync/orphans/orphan-tracker';
import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { FakeNote, PROJECT, TASK_ID, makeSync, remoteTasks } from '../../../support/sync-harness';

/**
 * Todoist cascades a delete to every descendant of the removed task (claude.md/gemini.md). Both
 * places the sync engine removes a task must reparent any still-live child away first, or that
 * child would be silently taken down too, purely as a side effect of deleting something else.
 */
describe('protecting a still-linked child from a provider-side cascade delete', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reparents an orphan\'s child to top-level before the orphan itself is removed', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(20_000);
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 0);
    orphans.flag(TASK_ID, 20_000);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const reparented: Array<[string, string | undefined, string]> = [];
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks(
          { id: TASK_ID, title: 'Orphaned parent', embeddedBlockId: 'tb-orphan' },
          { id: 'child-task', title: 'Still-linked child', parentId: TASK_ID },
        ),
        removeTask,
        reparentTask: (taskId, parentId, projectId) => {
          reparented.push([taskId, parentId, projectId]);
          return Promise.resolve(true);
        },
      },
      { orphans },
    );

    await sync.run(PROJECT);

    expect(reparented).toEqual([['child-task', undefined, PROJECT]]);
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
  });

  it('reparents a deleted line\'s still-linked child to top-level before the task itself is removed', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-p', providerTaskId: TASK_ID, lastSyncedTitle: 'Parent' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const reparented: Array<[string, string | undefined, string]> = [];
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: TASK_ID, title: 'Parent' },
        { id: 'child-task', title: 'Still-linked child', parentId: TASK_ID },
      ),
      removeTask,
      reparentTask: (taskId, parentId, projectId) => {
        reparented.push([taskId, parentId, projectId]);
        return Promise.resolve(true);
      },
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    expect(reparented).toEqual([['child-task', undefined, PROJECT]]);
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
  });
});
