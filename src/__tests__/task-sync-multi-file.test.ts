import { TaskLinkStore } from '../services/sync/task-links';
import { NewTask } from '../services/task-provider';
import { FakeNote, PROJECT, TASK_ID, makeMultiFileSync, projectExists, remoteTasks } from './support/sync-harness';

describe('TaskSync across multiple files', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a task for an unlinked line in each in-scope file', async () => {
    const fileA = new FakeNote('- [ ] Buy milk');
    const fileB = new FakeNote('- [ ] Walk the dog');
    const created: NewTask[] = [];
    let nextId = 1;
    const sync = makeMultiFileSync(
      new Map([
        ['A.md', fileA],
        ['B.md', fileB],
      ]),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks(),
        listProjects: projectExists,
        createTask: (task) => {
          created.push(task);
          return Promise.resolve({ id: `task-${nextId++}`, title: task.title });
        },
      },
    );

    expect(await sync.run(PROJECT)).toMatchObject({ created: 2 });
    expect(fileA.content).toMatch(/^- \[ \] Buy milk \^ots-[a-z0-9]{8}$/);
    expect(fileB.content).toMatch(/^- \[ \] Walk the dog \^ots-[a-z0-9]{8}$/);
    expect(created.map((task) => task.title).sort()).toEqual(['Buy milk', 'Walk the dog']);
  });

  it('pulls a remote title change into whichever file the task is actually anchored in', async () => {
    const fileA = new FakeNote('- [ ] Other task ^ots-b1');
    const fileB = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
      { blockId: 'ots-b1', providerTaskId: 'other-task-id', lastSyncedTitle: 'Other task' },
    ]);
    const sync = makeMultiFileSync(
      new Map([
        ['A.md', fileA],
        ['B.md', fileB],
      ]),
      links,
      {
        listTasks: remoteTasks(
          { id: TASK_ID, title: 'Buy oat milk' },
          { id: 'other-task-id', title: 'Other task' },
        ),
      },
    );

    expect(await sync.run(PROJECT)).toMatchObject({ pulled: 1 });
    expect(fileB.content).toBe('- [ ] Buy oat milk ^ots-a1');
    expect(fileA.content).toBe('- [ ] Other task ^ots-b1');
  });

  it('skips a task line whose tag does not match the configured filter', async () => {
    const note = new FakeNote('- [ ] Tagged task #work\n- [ ] Untagged task');
    const created: NewTask[] = [];
    const sync = makeMultiFileSync(
      new Map([['A.md', note]]),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks(),
        listProjects: projectExists,
        createTask: (task) => {
          created.push(task);
          return Promise.resolve({ id: TASK_ID, title: task.title });
        },
      },
      { isTagInScope: (task) => task.tags.includes('work') },
    );

    expect(await sync.run(PROJECT)).toMatchObject({ created: 1 });
    expect(created.map((task) => task.title)).toEqual(['Tagged task']);
    expect(note.content).toContain('Untagged task\n'.trim());
    expect(note.content).not.toMatch(/Untagged task \^ots-/);
  });

  it('resurrects a deleted-but-conflicting line into its last anchored file, not the first in scope', async () => {
    jest.useFakeTimers();
    const fileA = new FakeNote('- [ ] Unrelated ^ots-other');
    const fileB = new FakeNote('- [ ] Buy milk ^ots-a1');
    fileB.modifiedAt = 1_000;
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
      { blockId: 'ots-other', providerTaskId: 'other-id', lastSyncedTitle: 'Unrelated' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    // Starts agreeing with the line, so establishing lastKnownFilePath below does not itself pull
    // a title change; only changed to a conflicting title once the line is about to disappear.
    let remoteTitle = 'Buy milk';
    let remoteUpdatedAt: number | undefined;
    const sync = makeMultiFileSync(
      new Map([
        ['A.md', fileA],
        ['B.md', fileB],
      ]),
      links,
      {
        listTasks: () =>
          Promise.resolve([
            { id: TASK_ID, title: remoteTitle, updatedAt: remoteUpdatedAt },
            { id: 'other-id', title: 'Unrelated' },
          ]),
        removeTask,
      },
    );

    // Establishes ots-a1's lastKnownFilePath as B.md.
    await sync.run(PROJECT);
    expect(links.get('ots-a1')?.lastKnownFilePath).toBe('B.md');

    // The line disappears from B.md, racing a remote title change newer than B.md's mtime.
    fileB.content = '';
    remoteTitle = 'Buy oat milk';
    remoteUpdatedAt = 2_000;
    await sync.run(PROJECT); // first pass to notice it missing, starting its grace period
    jest.advanceTimersByTime(60_000);

    const outcome = await sync.run(PROJECT);

    expect(outcome).toMatchObject({ conflicted: 1, resurrectedLine: 1, removedTask: 0 });
    expect(removeTask).not.toHaveBeenCalledWith(TASK_ID);
    expect(fileB.content).toBe('- [ ] Buy oat milk ^ots-a1');
    expect(fileA.content).toBe('- [ ] Unrelated ^ots-other');
  });

  it('pulls a remote-only sub-task into the file its linked parent lives in, not another file in scope', async () => {
    const fileA = new FakeNote('- [ ] Unrelated ^ots-other');
    const fileB = new FakeNote('- [ ] Parent ^ots-parent1');
    const links = new TaskLinkStore([
      { blockId: 'ots-parent1', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent' },
      { blockId: 'ots-other', providerTaskId: 'other-id', lastSyncedTitle: 'Unrelated' },
    ]);
    const sync = makeMultiFileSync(
      new Map([
        ['A.md', fileA],
        ['B.md', fileB],
      ]),
      links,
      {
        listTasks: remoteTasks(
          { id: 'parent-task', title: 'Parent', embeddedBlockId: 'ots-parent1' },
          { id: 'other-id', title: 'Unrelated', embeddedBlockId: 'ots-other' },
          { id: 'child-task', title: 'Child', parentId: 'parent-task' },
        ),
        listProjects: projectExists,
      },
    );

    expect(await sync.run(PROJECT)).toMatchObject({ pulled: 1 });
    expect(fileB.content).toMatch(/^- \[ \] Parent \^ots-parent1\n\t- \[ \] Child \^ots-[a-z0-9]{8}$/);
    expect(fileA.content).toBe('- [ ] Unrelated ^ots-other');
  });

  it('relocates a remote reparent to a note the new parent lives in, carrying its description and nested child along', async () => {
    const fileB = new FakeNote(['- [ ] B ^ots-b', "\tB's own description", '\t- [ ] Grandchild ^ots-g'].join('\n'));
    const fileC = new FakeNote('- [ ] C ^ots-c');
    const links = new TaskLinkStore([
      { blockId: 'ots-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedDescription: "B's own description" },
      { blockId: 'ots-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
      { blockId: 'ots-g', providerTaskId: 'task-g', lastSyncedTitle: 'Grandchild', lastSyncedParentBlockId: 'ots-b' },
    ]);
    const sync = makeMultiFileSync(
      new Map([
        ['B.md', fileB],
        ['C.md', fileC],
      ]),
      links,
      {
        listTasks: remoteTasks(
          {
            id: 'task-b',
            title: 'B',
            embeddedBlockId: 'ots-b',
            parentId: 'task-c',
            description: "B's own description\n\nTaskBridge ID: ^ots-b",
          },
          { id: 'task-c', title: 'C', embeddedBlockId: 'ots-c' },
          { id: 'task-g', title: 'Grandchild', embeddedBlockId: 'ots-g', parentId: 'task-b' },
        ),
        listProjects: projectExists,
      },
    );

    expect(await sync.run(PROJECT)).toMatchObject({ pulled: 1 });
    expect(fileB.content).toBe('');
    expect(fileC.content).toBe(
      ['- [ ] C ^ots-c', '\t- [ ] B ^ots-b', "\t\tB's own description", '\t\t- [ ] Grandchild ^ots-g'].join('\n'),
    );
    expect(links.get('ots-b')).toMatchObject({ lastSyncedParentBlockId: 'ots-c', lastKnownFilePath: 'C.md' });
  });

  it('leaves a remote reparent alone when the new parent has no line anywhere in scope yet', async () => {
    const fileB = new FakeNote('- [ ] B ^ots-b');
    const links = new TaskLinkStore([{ blockId: 'ots-b', providerTaskId: 'task-b', lastSyncedTitle: 'B' }]);
    const sync = makeMultiFileSync(
      new Map([['B.md', fileB]]),
      links,
      {
        listTasks: remoteTasks(
          { id: 'task-b', title: 'B', embeddedBlockId: 'ots-b', parentId: 'ghost-task' },
          // Tracked in the fetched project, so its block id resolves, but no note anchors it.
          { id: 'ghost-task', title: 'Ghost', embeddedBlockId: 'ots-ghost' },
        ),
        listProjects: projectExists,
      },
    );

    expect(await sync.run(PROJECT)).toMatchObject({ pulled: 0, conflicted: 0 });
    expect(fileB.content).toBe('- [ ] B ^ots-b');
    expect(links.get('ots-b')?.lastSyncedParentBlockId).toBeUndefined();
  });
});
