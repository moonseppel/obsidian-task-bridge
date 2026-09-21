import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { NewTask } from '../../../../services/task-provider';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

function childBlockId(note: FakeNote): string {
  return /\^(\S+)$/.exec(note.content.split('\n')[1])?.[1] ?? '';
}

describe('TaskSync creating a task nested under a completed parent', () => {
  it('nests a checked child under an already-linked parent whose task is completed, recording the answer', async () => {
    const note = new FakeNote('- [x] Parent ^tb-parent1\n\t- [x] Child');
    const links = new TaskLinkStore([
      { blockId: 'tb-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent', lastSyncedDone: true },
    ]);
    const created: NewTask[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-parent1', isCompleted: true }),
      listProjects: projectExists,
      createTask: (task) => {
        created.push(task);
        return Promise.resolve({ id: 'child-task', title: task.title, parentId: task.parentId, isCompleted: true });
      },
    });

    await sync.run(PROJECT);

    expect(created).toMatchObject([{ title: 'Child', parentId: 'parent-task', isCompleted: true }]);
    const blockId = childBlockId(note);
    expect(links.get(blockId)).toMatchObject({ lastSyncedParentBlockId: 'tb-parent1', lastSyncedDone: true });
  });

  it('creates a checked line completed in the same call, without a separate complete request', async () => {
    const note = new FakeNote('- [x] Buy milk');
    const links = new TaskLinkStore();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      // No completeTask stub at all: a separate completion call would throw as unimplemented.
      createTask: (task) => Promise.resolve({ id: 'task-1', title: task.title }),
    });

    await sync.run(PROJECT);
    const blockId = /\^(\S+)$/.exec(note.content)?.[1] ?? '';

    expect(links.get(blockId)?.lastSyncedDone).toBe(true);
  });

  it('pushes a completion on the next pass when the creation answer came back still open', async () => {
    const note = new FakeNote('- [x] Parent ^tb-parent1\n\t- [x] Child');
    const links = new TaskLinkStore([
      { blockId: 'tb-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent', lastSyncedDone: true },
    ]);
    const completed: string[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-parent1', isCompleted: true },
        { id: 'child-task', title: 'Child', isCompleted: false },
      ),
      listProjects: projectExists,
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
    expect(links.get(childBlockId(note))?.lastSyncedDone).toBe(true);
  });

  it('pushes the parent again on the next pass when the creation answer came back without it', async () => {
    const note = new FakeNote('- [x] Parent ^tb-parent1\n\t- [x] Child');
    const links = new TaskLinkStore([
      { blockId: 'tb-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent', lastSyncedDone: true },
    ]);
    const reparented: Array<[string, string | undefined]> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-parent1', isCompleted: true },
        { id: 'child-task', title: 'Child', isCompleted: true },
      ),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: 'child-task', title: task.title, isCompleted: true, parentId: undefined }),
      reparentTask: (taskId, parentId) => {
        reparented.push([taskId, parentId]);
        return Promise.resolve();
      },
    });

    await sync.run(PROJECT);
    expect(links.get(childBlockId(note))?.lastSyncedParentBlockId).toBeUndefined();

    await sync.run(PROJECT);

    expect(reparented).toEqual([['child-task', 'parent-task']]);
    expect(links.get(childBlockId(note))?.lastSyncedParentBlockId).toBe('tb-parent1');
  });
});
