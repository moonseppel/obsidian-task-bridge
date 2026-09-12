import { TaskLinkStore } from '../services/sync/task-links';
import { NewTask } from '../services/task-provider';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from './support/sync-harness';

function blockIds(content: string): string[] {
  return [...content.matchAll(/\^(\S+)/g)].map((match) => match[1]);
}

describe('TaskSync nested task creation (push)', () => {
  it('creates a parent and its child in one pass, nesting the child under the parent\'s new provider id', async () => {
    const note = new FakeNote('- [ ] Parent\n\t- [ ] Child');
    const links = new TaskLinkStore();
    const created: NewTask[] = [];
    let nextId = 0;
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => {
        created.push(task);
        nextId += 1;
        return Promise.resolve({ id: `t${nextId}`, title: task.title });
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 2 });

    expect(created[0]).toMatchObject({ title: 'Parent', parentId: undefined });
    expect(created[1]).toMatchObject({ title: 'Child', parentId: 't1' });

    const [parentBlockId, childBlockId] = blockIds(note.content);
    expect(links.get(childBlockId)?.lastSyncedParentBlockId).toBe(parentBlockId);
    expect(links.get(parentBlockId)?.lastSyncedParentBlockId).toBeUndefined();
  });

  it('nests a grandchild three levels deep, created together in one pass', async () => {
    const note = new FakeNote('- [ ] A\n\t- [ ] B\n\t\t- [ ] C');
    const links = new TaskLinkStore();
    const created: NewTask[] = [];
    let nextId = 0;
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => {
        created.push(task);
        nextId += 1;
        return Promise.resolve({ id: `t${nextId}`, title: task.title });
      },
    });

    await sync.run(PROJECT);

    expect(created.map((task) => [task.title, task.parentId])).toEqual([
      ['A', undefined],
      ['B', 't1'],
      ['C', 't2'],
    ]);
  });

  it('nests a new child under a parent that was already linked from an earlier pass', async () => {
    const note = new FakeNote('- [ ] Parent ^ots-parent1');
    const links = new TaskLinkStore([
      { blockId: 'ots-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent' },
    ]);
    const created: NewTask[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'parent-task', title: 'Parent', embeddedBlockId: 'ots-parent1' }),
      listProjects: projectExists,
      createTask: (task) => {
        created.push(task);
        return Promise.resolve({ id: 'child-task', title: task.title });
      },
    });

    note.content = '- [ ] Parent ^ots-parent1\n\t- [ ] Child';
    await sync.run(PROJECT);

    expect(created).toMatchObject([{ title: 'Child', parentId: 'parent-task' }]);
  });

  it('recreates a nested task under its still-linked parent after a conflicting remote deletion', async () => {
    const note = new FakeNote('- [ ] Parent ^ots-parent1\n\t- [ ] Child edited ^ots-child1');
    const links = new TaskLinkStore([
      { blockId: 'ots-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent' },
      { blockId: 'ots-child1', providerTaskId: 'child-task', lastSyncedTitle: 'Child' },
    ]);
    const created: NewTask[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'parent-task', title: 'Parent', embeddedBlockId: 'ots-parent1' }),
      listProjects: projectExists,
      getTask: () => Promise.resolve(undefined),
      createTask: (task) => {
        created.push(task);
        return Promise.resolve({ id: 'new-child-task', title: task.title });
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ recreatedTask: 1 });
    expect(created).toMatchObject([{ title: 'Child edited', parentId: 'parent-task' }]);
    expect(links.get('ots-child1')?.providerTaskId).toBe('new-child-task');
  });

  it('creates a nested task as top-level when its parent line has not been synced at all', async () => {
    const note = new FakeNote('Not a task\n\t- [ ] Child');
    const links = new TaskLinkStore();
    const created: NewTask[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => {
        created.push(task);
        return Promise.resolve({ id: 'child-task', title: task.title });
      },
    });

    await sync.run(PROJECT);

    expect(created).toMatchObject([{ title: 'Child', parentId: undefined }]);
  });
});
