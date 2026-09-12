import { TaskLinkStore } from '../services/sync/task-links';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from './support/sync-harness';

describe('TaskSync pulling remote-only nested tasks', () => {
  it('inserts a sub-task added directly in the provider under its linked parent', async () => {
    const note = new FakeNote('- [ ] Parent ^ots-parent1');
    const links = new TaskLinkStore([
      { blockId: 'ots-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'ots-parent1' },
        { id: 'child-task', title: 'Child', parentId: 'parent-task' },
      ),
      listProjects: projectExists,
    });

    expect(await sync.run(PROJECT)).toMatchObject({ pulled: 1 });
    expect(note.content).toMatch(/^- \[ \] Parent \^ots-parent1\n\t- \[ \] Child \^ots-[a-z0-9]{8}$/);

    const childBlockId = /\t- \[ \] Child \^(\S+)/.exec(note.content)?.[1] ?? '';
    expect(links.get(childBlockId)).toMatchObject({
      providerTaskId: 'child-task',
      lastSyncedTitle: 'Child',
      lastSyncedParentBlockId: 'ots-parent1',
    });
  });

  it('never pulls in a top-level provider task with no linked ancestor', async () => {
    const note = new FakeNote('Not a task, so nothing gets created for this line');
    const links = new TaskLinkStore();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'native-task', title: 'Made in Todoist' }),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content).toBe('Not a task, so nothing gets created for this line');
  });

  it('pulls a remote-only grandchild in together with its remote-only parent, in one pass', async () => {
    const note = new FakeNote('- [ ] Parent ^ots-parent1');
    const links = new TaskLinkStore([
      { blockId: 'ots-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'ots-parent1' },
        { id: 'child-task', title: 'Child', parentId: 'parent-task' },
        { id: 'grandchild-task', title: 'Grandchild', parentId: 'child-task' },
      ),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    const lines = note.content.split('\n');
    expect(lines[1]).toMatch(/^\t- \[ \] Child \^/);
    expect(lines[2]).toMatch(/^\t\t- \[ \] Grandchild \^/);

    const childBlockId = /\^(\S+)/.exec(lines[1])?.[1] ?? '';
    const grandchildBlockId = /\^(\S+)/.exec(lines[2])?.[1] ?? '';
    expect(links.get(grandchildBlockId)).toMatchObject({
      providerTaskId: 'grandchild-task',
      lastSyncedParentBlockId: childBlockId,
    });
  });

  it('appends a new remote child after an existing description, leaving the description untouched', async () => {
    const note = new FakeNote('- [ ] Parent ^ots-parent1\n\tSome description');
    const links = new TaskLinkStore([
      {
        blockId: 'ots-parent1',
        providerTaskId: 'parent-task',
        lastSyncedTitle: 'Parent',
        lastSyncedDescription: 'Some description',
      },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        {
          id: 'parent-task',
          title: 'Parent',
          embeddedBlockId: 'ots-parent1',
          description: 'Some description\n\nObsidian Task Sync ID: ^ots-parent1',
        },
        { id: 'child-task', title: 'Child', parentId: 'parent-task' },
      ),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content.split('\n')).toEqual([
      '- [ ] Parent ^ots-parent1',
      '\tSome description',
      expect.stringMatching(/^\t- \[ \] Child \^/) as unknown as string,
    ]);
  });

  it('does not duplicate a remote task that is already linked to a line elsewhere', async () => {
    const note = new FakeNote('- [ ] Parent ^ots-parent1\n- [ ] Child elsewhere ^ots-child1');
    const links = new TaskLinkStore([
      { blockId: 'ots-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent' },
      { blockId: 'ots-child1', providerTaskId: 'child-task', lastSyncedTitle: 'Child elsewhere' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'ots-parent1' },
        { id: 'child-task', title: 'Child elsewhere', embeddedBlockId: 'ots-child1' },
      ),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content).toBe('- [ ] Parent ^ots-parent1\n- [ ] Child elsewhere ^ots-child1');
  });
});
