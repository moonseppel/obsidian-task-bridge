import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { NewTask } from '../../../../services/task-provider';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

describe('TaskSync holding an open child back from a completed parent', () => {
  it('gives a held-back line no anchor and no link', async () => {
    const note = new FakeNote('- [x] Parent ^tb-parent1\n\t- [ ] Child');
    const links = new TaskLinkStore([
      { blockId: 'tb-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent', lastSyncedDone: true },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-parent1', isCompleted: true }),
      listProjects: projectExists,
      createTask: () => Promise.resolve(undefined),
    });

    const outcome = await sync.run(PROJECT);

    expect(outcome.created).toBe(0);
    expect(note.content).toBe('- [x] Parent ^tb-parent1\n\t- [ ] Child');
    expect(links.size).toBe(1);
  });

  it('creates a task nested under a held-back line as top-level instead, and only once', async () => {
    const note = new FakeNote('- [x] Parent ^tb-parent1\n\t- [ ] Child\n\t\t- [ ] Grandchild');
    const links = new TaskLinkStore([
      { blockId: 'tb-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent', lastSyncedDone: true },
    ]);
    const created: NewTask[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-parent1', isCompleted: true },
        { id: 'grandchild-task', title: 'Grandchild' },
      ),
      listProjects: projectExists,
      createTask: (task) => {
        if (task.title === 'Child') {
          return Promise.resolve(undefined);
        }

        created.push(task);
        return Promise.resolve({ id: 'grandchild-task', title: task.title });
      },
    });

    await sync.run(PROJECT);
    expect(created).toMatchObject([{ title: 'Grandchild', parentId: undefined }]);

    // Nothing about the settled, top-level grandchild is pushed again on a later pass.
    await sync.run(PROJECT);
    expect(created).toHaveLength(1);
  });

  it('creates a held-back line once its parent is later reopened', async () => {
    const note = new FakeNote('- [x] Parent ^tb-parent1\n\t- [ ] Child');
    const links = new TaskLinkStore([
      { blockId: 'tb-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent', lastSyncedDone: true },
    ]);
    const created: NewTask[] = [];
    let parentCompleted = true;
    const sync = makeSync(note, links, {
      listTasks: () =>
        Promise.resolve([
          { id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-parent1', isCompleted: parentCompleted },
        ]),
      listProjects: projectExists,
      createTask: (task) => {
        if (parentCompleted) {
          return Promise.resolve(undefined);
        }

        created.push(task);
        return Promise.resolve({ id: 'child-task', title: task.title, parentId: task.parentId });
      },
    });

    await sync.run(PROJECT);
    expect(created).toEqual([]);

    parentCompleted = false;
    note.content = '- [ ] Parent ^tb-parent1\n\t- [ ] Child';
    await sync.run(PROJECT);

    expect(created).toMatchObject([{ title: 'Child', parentId: 'parent-task' }]);
  });
});
