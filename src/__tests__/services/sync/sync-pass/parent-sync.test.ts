import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

describe('a deleted parent line', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('leaves its child untouched locally, pushing the loss of a parent with no note edit at all', async () => {
    // The parent's own line is already gone from the note; only the child's remains.
    const note = new FakeNote('- [ ] Child ^tb-c');
    const links = new TaskLinkStore([
      { blockId: 'tb-p', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent' },
      { blockId: 'tb-c', providerTaskId: 'child-task', lastSyncedTitle: 'Child', lastSyncedParentBlockId: 'tb-p' },
    ]);
    const reparented: Array<[string, string | undefined]> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-p' },
        { id: 'child-task', title: 'Child', embeddedBlockId: 'tb-c', parentId: 'parent-task' },
      ),
      listProjects: projectExists,
      reparentTask: (taskId, parentId) => {
        reparented.push([taskId, parentId]);
        return Promise.resolve(true);
      },
    });

    const before = note.content;
    await sync.run(PROJECT);

    expect(reparented).toEqual([['child-task', undefined]]);
    expect(note.content).toBe(before);
    expect(links.get('tb-c')?.lastSyncedParentBlockId).toBeUndefined();
  });
});

describe('TaskSync parent field sync', () => {
  it('pushes a local reparent to a specific new parent, without touching the note', async () => {
    const note = new FakeNote('- [ ] A ^tb-a\n- [ ] C ^tb-c\n\t- [ ] B ^tb-b');
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'tb-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
      { blockId: 'tb-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'tb-a' },
    ]);
    const reparented: Array<[string, string | undefined, string]> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'tb-a' },
        { id: 'task-c', title: 'C', embeddedBlockId: 'tb-c' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'tb-b', parentId: 'task-a', projectId: PROJECT },
      ),
      listProjects: projectExists,
      reparentTask: (taskId, parentId, projectId) => {
        reparented.push([taskId, parentId, projectId]);
        return Promise.resolve(true);
      },
    });

    const before = note.content;
    const outcome = await sync.run(PROJECT);

    expect(reparented).toEqual([['task-b', 'task-c', PROJECT]]);
    expect(note.content).toBe(before);
    expect(links.get('tb-b')?.lastSyncedParentBlockId).toBe('tb-c');
    expect(outcome.pushed).toBe(1);
  });

  it('leaves the link unchanged and retries next pass when a reparent is refused', async () => {
    const note = new FakeNote('- [ ] A ^tb-a\n- [ ] C ^tb-c\n\t- [ ] B ^tb-b');
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'tb-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
      { blockId: 'tb-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'tb-a' },
    ]);
    const reparented: Array<[string, string | undefined, string]> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'tb-a' },
        { id: 'task-c', title: 'C', embeddedBlockId: 'tb-c' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'tb-b', parentId: 'task-a', projectId: PROJECT },
      ),
      listProjects: projectExists,
      reparentTask: (taskId, parentId, projectId) => {
        reparented.push([taskId, parentId, projectId]);
        return Promise.resolve(false);
      },
    });

    const before = note.content;
    const outcome = await sync.run(PROJECT);

    expect(note.content).toBe(before);
    expect(links.get('tb-b')?.lastSyncedParentBlockId).toBe('tb-a');
    expect(outcome.pushed).toBe(0);

    await sync.run(PROJECT);

    expect(reparented).toEqual([
      ['task-b', 'task-c', PROJECT],
      ['task-b', 'task-c', PROJECT],
    ]);
  });

  it('pushes a local reparent to top-level as clearing the parent', async () => {
    const note = new FakeNote('- [ ] A ^tb-a\n- [ ] B ^tb-b');
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'tb-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'tb-a' },
    ]);
    const reparented: Array<string | undefined> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'tb-a' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'tb-b', parentId: 'task-a' },
      ),
      listProjects: projectExists,
      reparentTask: (_taskId, parentId) => {
        reparented.push(parentId);
        return Promise.resolve(true);
      },
    });

    await sync.run(PROJECT);

    expect(reparented).toEqual([undefined]);
    expect(links.get('tb-b')?.lastSyncedParentBlockId).toBeUndefined();
  });

  it('pulls a cleared remote parent by dedenting the line in place', async () => {
    const note = new FakeNote('- [ ] A ^tb-a\n\t- [ ] B ^tb-b');
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'tb-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'tb-a' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'tb-a' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'tb-b' },
      ),
      listProjects: projectExists,
    });

    const outcome = await sync.run(PROJECT);

    expect(note.content).toBe('- [ ] A ^tb-a\n- [ ] B ^tb-b');
    expect(links.get('tb-b')?.lastSyncedParentBlockId).toBeUndefined();
    expect(outcome.pulled).toBe(1);
  });

  it('pulls a remote reparent to a specific new parent by relocating the line', async () => {
    const note = new FakeNote('- [ ] A ^tb-a\n\t- [ ] B ^tb-b\n- [ ] C ^tb-c');
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'tb-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
      { blockId: 'tb-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'tb-a' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'tb-a' },
        { id: 'task-c', title: 'C', embeddedBlockId: 'tb-c' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'tb-b', parentId: 'task-c' },
      ),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content).toBe('- [ ] A ^tb-a\n- [ ] C ^tb-c\n\t- [ ] B ^tb-b');
    expect(links.get('tb-b')?.lastSyncedParentBlockId).toBe('tb-c');
  });

  it('relocates a task together with its own description and nested children, intact', async () => {
    const note = new FakeNote(
      [
        '- [ ] A ^tb-a',
        '\t- [ ] B ^tb-b',
        "\t\tB's own description",
        '\t\t- [ ] Grandchild ^tb-g',
        '- [ ] C ^tb-c',
      ].join('\n'),
    );
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'tb-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
      {
        blockId: 'tb-b',
        providerTaskId: 'task-b',
        lastSyncedTitle: 'B',
        lastSyncedParentBlockId: 'tb-a',
        lastSyncedDescription: "B's own description",
      },
      { blockId: 'tb-g', providerTaskId: 'task-g', lastSyncedTitle: 'Grandchild', lastSyncedParentBlockId: 'tb-b' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'tb-a' },
        { id: 'task-c', title: 'C', embeddedBlockId: 'tb-c' },
        {
          id: 'task-b',
          title: 'B',
          embeddedBlockId: 'tb-b',
          parentId: 'task-c',
          description: "B's own description\n\nTaskBridge ID: ^tb-b",
        },
        { id: 'task-g', title: 'Grandchild', embeddedBlockId: 'tb-g', parentId: 'task-b' },
      ),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content).toBe(
      [
        '- [ ] A ^tb-a',
        '- [ ] C ^tb-c',
        '\t- [ ] B ^tb-b',
        "\t\tB's own description",
        '\t\t- [ ] Grandchild ^tb-g',
      ].join('\n'),
    );
  });

  it('resolves a conflicting reparent on both sides by recency, pulling the newer remote move', async () => {
    const note = new FakeNote('- [ ] A ^tb-a\n- [ ] D ^tb-d\n\t- [ ] B ^tb-b\n- [ ] E ^tb-e');
    note.modifiedAt = 1_000;
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'task-a', lastSyncedTitle: 'A' },
      { blockId: 'tb-d', providerTaskId: 'task-d', lastSyncedTitle: 'D' },
      { blockId: 'tb-e', providerTaskId: 'task-e', lastSyncedTitle: 'E' },
      { blockId: 'tb-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'tb-a' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        { id: 'task-a', title: 'A', embeddedBlockId: 'tb-a' },
        { id: 'task-d', title: 'D', embeddedBlockId: 'tb-d' },
        { id: 'task-e', title: 'E', embeddedBlockId: 'tb-e' },
        { id: 'task-b', title: 'B', embeddedBlockId: 'tb-b', parentId: 'task-e', updatedAt: 2_000 },
      ),
      listProjects: projectExists,
    });

    const outcome = await sync.run(PROJECT);

    expect(outcome.conflicted).toBe(1);
    expect(note.content).toBe('- [ ] A ^tb-a\n- [ ] D ^tb-d\n- [ ] E ^tb-e\n\t- [ ] B ^tb-b');
    expect(links.get('tb-b')?.lastSyncedParentBlockId).toBe('tb-e');
  });
});
