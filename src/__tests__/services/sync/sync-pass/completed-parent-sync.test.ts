import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { NewTask } from '../../../../services/task-provider';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

// A checked line is created only when its task is recreated: one never synced is skipped (0.11.5).
const CHECKED_CHILD_UNDER_COMPLETED_PARENT = '- [x] Parent ^tb-parent1\n\t- [x] Child ^tb-child1';
const DELETED_IN_TODOIST = (): Promise<undefined> => Promise.resolve(undefined);

function linksWithRenamedChild(): TaskLinkStore {
  return new TaskLinkStore([
    { blockId: 'tb-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent', lastSyncedDone: true },
    { blockId: 'tb-child1', providerTaskId: 'deleted-task', lastSyncedTitle: 'Old child', lastSyncedDone: false },
  ]);
}

describe('TaskSync creating a task nested under a completed parent', () => {
  it('nests a checked child under an already-linked parent whose task is completed, recording the answer', async () => {
    const note = new FakeNote(CHECKED_CHILD_UNDER_COMPLETED_PARENT);
    const links = linksWithRenamedChild();
    const created: NewTask[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-parent1', isCompleted: true }),
      listProjects: projectExists,
      getTask: DELETED_IN_TODOIST,
      createTask: (task) => {
        created.push(task);
        return Promise.resolve({ id: 'child-task', title: task.title, parentId: task.parentId, isCompleted: true });
      },
    });

    await sync.run(PROJECT);

    expect(created).toMatchObject([{ title: 'Child', parentId: 'parent-task', isCompleted: true }]);
    expect(links.get('tb-child1')).toMatchObject({ lastSyncedParentBlockId: 'tb-parent1', lastSyncedDone: true });
  });

  it('creates a checked line completed in the same call, without a separate complete request', async () => {
    const note = new FakeNote('- [x] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: 'deleted-task', lastSyncedTitle: 'Buy bread', lastSyncedDone: false },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: DELETED_IN_TODOIST,
      // No completeTask stub at all: a separate completion call would throw as unimplemented.
      createTask: (task) => Promise.resolve({ id: 'task-1', title: task.title }),
    });

    await sync.run(PROJECT);

    expect(links.get('tb-a1')?.lastSyncedDone).toBe(true);
  });

  it('pushes a completion on the next pass when the creation answer came back still open', async () => {
    const note = new FakeNote(CHECKED_CHILD_UNDER_COMPLETED_PARENT);
    const links = linksWithRenamedChild();
    const completed: string[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-parent1', isCompleted: true },
        { id: 'child-task', title: 'Child', isCompleted: false },
      ),
      listProjects: projectExists,
      getTask: DELETED_IN_TODOIST,
      createTask: (task) => Promise.resolve({ id: 'child-task', title: task.title, isCompleted: false }),
      completeTask: (id) => {
        completed.push(id);
        return Promise.resolve();
      },
    });

    await sync.run(PROJECT);
    expect(completed).toEqual([]);

    await sync.run(PROJECT);

    expect(completed).toEqual(['child-task']);
    expect(links.get('tb-child1')?.lastSyncedDone).toBe(true);
  });

  it('pushes the parent again on the next pass when the creation answer came back without it', async () => {
    const note = new FakeNote(CHECKED_CHILD_UNDER_COMPLETED_PARENT);
    const links = linksWithRenamedChild();
    const reparented: Array<[string, string | undefined]> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-parent1', isCompleted: true },
        { id: 'child-task', title: 'Child', isCompleted: true },
      ),
      listProjects: projectExists,
      getTask: DELETED_IN_TODOIST,
      createTask: (task) => Promise.resolve({ id: 'child-task', title: task.title, isCompleted: true, parentId: undefined }),
      reparentTask: (taskId, parentId) => {
        reparented.push([taskId, parentId]);
        return Promise.resolve(true);
      },
    });

    await sync.run(PROJECT);
    expect(links.get('tb-child1')?.lastSyncedParentBlockId).toBeUndefined();

    await sync.run(PROJECT);

    expect(reparented).toEqual([['child-task', 'parent-task']]);
    expect(links.get('tb-child1')?.lastSyncedParentBlockId).toBe('tb-parent1');
  });
});
