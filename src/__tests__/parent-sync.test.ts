import { TaskLinkStore } from '../services/sync/task-links';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from './support/sync-harness';

describe('a deleted parent line', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('leaves its child untouched locally, pushing the loss of a parent with no note edit at all', async () => {
    // The parent's own line is already gone from the note; only the child's remains.
    const note = new FakeNote('- [ ] Child ^ots-c');
    const links = new TaskLinkStore([
      { blockId: 'ots-p', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent' },
      { blockId: 'ots-c', providerTaskId: 'child-task', lastSyncedTitle: 'Child', lastSyncedParentBlockId: 'ots-p' },
    ]);
    const reparented: Array<[string, string | undefined]> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'ots-p' },
        { id: 'child-task', title: 'Child', embeddedBlockId: 'ots-c', parentId: 'parent-task' },
      ),
      listProjects: projectExists,
      reparentTask: (taskId, parentId) => {
        reparented.push([taskId, parentId]);
        return Promise.resolve();
      },
    });

    const before = note.content;
    await sync.run(PROJECT);

    expect(reparented).toEqual([['child-task', undefined]]);
    expect(note.content).toBe(before);
    expect(links.get('ots-c')?.lastSyncedParentBlockId).toBeUndefined();
  });
});

describe('TaskSync parent field sync', () => {
  it('pushes a local reparent to a specific new parent, without touching the note', async () => {
    const note = new FakeNote('- [ ] A ^ots-a\n- [ ] C ^ots-c\n\t- [ ] B ^ots-b');
    const links = new TaskLinkStore([
      { blockId: 'ots-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'ots-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
      { blockId: 'ots-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'ots-a' },
    ]);
    const reparented: Array<[string, string | undefined, string]> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'ots-a' },
        { id: 'task-c', title: 'C', embeddedBlockId: 'ots-c' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'ots-b', parentId: 'task-a' },
      ),
      listProjects: projectExists,
      reparentTask: (taskId, parentId, projectId) => {
        reparented.push([taskId, parentId, projectId]);
        return Promise.resolve();
      },
    });

    const before = note.content;
    const outcome = await sync.run(PROJECT);

    expect(reparented).toEqual([['task-b', 'task-c', PROJECT]]);
    expect(note.content).toBe(before);
    expect(links.get('ots-b')?.lastSyncedParentBlockId).toBe('ots-c');
    expect(outcome.pushed).toBe(1);
  });

  it('pushes a local reparent to top-level as clearing the parent', async () => {
    const note = new FakeNote('- [ ] A ^ots-a\n- [ ] B ^ots-b');
    const links = new TaskLinkStore([
      { blockId: 'ots-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'ots-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'ots-a' },
    ]);
    const reparented: Array<string | undefined> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'ots-a' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'ots-b', parentId: 'task-a' },
      ),
      listProjects: projectExists,
      reparentTask: (_taskId, parentId) => {
        reparented.push(parentId);
        return Promise.resolve();
      },
    });

    await sync.run(PROJECT);

    expect(reparented).toEqual([undefined]);
    expect(links.get('ots-b')?.lastSyncedParentBlockId).toBeUndefined();
  });

  it('pulls a cleared remote parent by dedenting the line in place', async () => {
    const note = new FakeNote('- [ ] A ^ots-a\n\t- [ ] B ^ots-b');
    const links = new TaskLinkStore([
      { blockId: 'ots-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'ots-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'ots-a' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'ots-a' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'ots-b' },
      ),
      listProjects: projectExists,
    });

    const outcome = await sync.run(PROJECT);

    expect(note.content).toBe('- [ ] A ^ots-a\n- [ ] B ^ots-b');
    expect(links.get('ots-b')?.lastSyncedParentBlockId).toBeUndefined();
    expect(outcome.pulled).toBe(1);
  });

  it('pulls a remote reparent to a specific new parent by relocating the line', async () => {
    const note = new FakeNote('- [ ] A ^ots-a\n\t- [ ] B ^ots-b\n- [ ] C ^ots-c');
    const links = new TaskLinkStore([
      { blockId: 'ots-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'ots-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
      { blockId: 'ots-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'ots-a' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'ots-a' },
        { id: 'task-c', title: 'C', embeddedBlockId: 'ots-c' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'ots-b', parentId: 'task-c' },
      ),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content).toBe('- [ ] A ^ots-a\n- [ ] C ^ots-c\n\t- [ ] B ^ots-b');
    expect(links.get('ots-b')?.lastSyncedParentBlockId).toBe('ots-c');
  });

  it('relocates a task together with its own description and nested children, intact', async () => {
    const note = new FakeNote(
      [
        '- [ ] A ^ots-a',
        '\t- [ ] B ^ots-b',
        "\t\tB's own description",
        '\t\t- [ ] Grandchild ^ots-g',
        '- [ ] C ^ots-c',
      ].join('\n'),
    );
    const links = new TaskLinkStore([
      { blockId: 'ots-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'ots-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
      {
        blockId: 'ots-b',
        providerTaskId: 'task-b',
        lastSyncedTitle: 'B',
        lastSyncedParentBlockId: 'ots-a',
        lastSyncedDescription: "B's own description",
      },
      { blockId: 'ots-g', providerTaskId: 'task-g', lastSyncedTitle: 'Grandchild', lastSyncedParentBlockId: 'ots-b' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'ots-a' },
        { id: 'task-c', title: 'C', embeddedBlockId: 'ots-c' },
        {
          id: 'task-b',
          title: 'B',
          embeddedBlockId: 'ots-b',
          parentId: 'task-c',
          description: "B's own description\n\nObsidian Task Sync ID: ^ots-b",
        },
        { id: 'task-g', title: 'Grandchild', embeddedBlockId: 'ots-g', parentId: 'task-b' },
      ),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content).toBe(
      [
        '- [ ] A ^ots-a',
        '- [ ] C ^ots-c',
        '\t- [ ] B ^ots-b',
        "\t\tB's own description",
        '\t\t- [ ] Grandchild ^ots-g',
      ].join('\n'),
    );
  });

  it('resolves a conflicting reparent on both sides by recency, pulling the newer remote move', async () => {
    const note = new FakeNote('- [ ] A ^ots-a\n- [ ] D ^ots-d\n\t- [ ] B ^ots-b\n- [ ] E ^ots-e');
    note.modifiedAt = 1_000;
    const links = new TaskLinkStore([
      { blockId: 'ots-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'ots-d', providerTaskId: 'task-d', lastSyncedTitle: 'D' },
      { blockId: 'ots-e', providerTaskId: 'task-e', lastSyncedTitle: 'E' },
      { blockId: 'ots-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'ots-a' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'ots-a' },
        { id: 'task-d', title: 'D', embeddedBlockId: 'ots-d' },
        { id: 'task-e', title: 'E', embeddedBlockId: 'ots-e' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'ots-b', parentId: 'task-e', updatedAt: 2_000 },
      ),
      listProjects: projectExists,
    });

    const outcome = await sync.run(PROJECT);

    expect(outcome.conflicted).toBe(1);
    expect(note.content).toBe('- [ ] A ^ots-a\n- [ ] D ^ots-d\n- [ ] E ^ots-e\n\t- [ ] B ^ots-b');
    expect(links.get('ots-b')?.lastSyncedParentBlockId).toBe('ots-e');
  });
});
