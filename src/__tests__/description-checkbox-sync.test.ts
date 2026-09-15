import { CrossFileParentSync } from '../services/sync/cross-file-parent-sync';
import { OrphanTracker } from '../services/sync/orphan-tracker';
import { composeRemoteDescription } from '../services/sync/task-description';
import { TaskLinkStore } from '../services/sync/task-links';
import { LooseProviderTask } from './support/stub-provider';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from './support/sync-harness';

const PARENT_LINE = '- [ ] another nesting test ^ots-parent1';
const TEXT_LINE = '\t\t- [ ] direct grandchild ^ots-child1';
const PUSHED_TEXT = '\t- [ ] direct grandchild ^ots-child1';

/** A child synced as a task of its own before its line became the parent's description text. */
function linksForSyncedChild(parentDescription: string): TaskLinkStore {
  return new TaskLinkStore([
    {
      blockId: 'ots-parent1',
      providerTaskId: 'parent-task',
      lastSyncedTitle: 'another nesting test',
      lastSyncedDescription: parentDescription,
    },
    {
      blockId: 'ots-child1',
      providerTaskId: 'child-task',
      lastSyncedTitle: 'direct grandchild',
      lastSyncedParentBlockId: 'ots-parent1',
    },
  ]);
}

function remoteParentAndChild(parentDescription: string): () => Promise<LooseProviderTask[]> {
  return remoteTasks(
    {
      id: 'parent-task',
      title: 'another nesting test',
      embeddedBlockId: 'ots-parent1',
      description: composeRemoteDescription(parentDescription, 'ots-parent1'),
    },
    {
      id: 'child-task',
      title: 'direct grandchild',
      embeddedBlockId: 'ots-child1',
      parentId: 'parent-task',
      description: composeRemoteDescription('', 'ots-child1'),
    },
  );
}

describe('TaskSync with a checkbox line inside a description', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates no task for a checkbox line two levels under a new task', async () => {
    const createTask = jest.fn().mockResolvedValue({ id: 'parent-task', title: 'Parent' });
    const sync = makeSync(new FakeNote('- [ ] Parent\n\t\t- [ ] Not a task'), new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask,
    });

    await sync.run(PROJECT);

    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it('does not sync an already-linked line that became description text as a task of its own', async () => {
    const renamedLine = '\t\t- [ ] direct grandchild renamed ^ots-child1';
    const settledText = '\t- [ ] direct grandchild renamed ^ots-child1';
    const updateTaskTitle = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(new FakeNote(`${PARENT_LINE}\n${renamedLine}`), linksForSyncedChild(settledText), {
      listTasks: remoteParentAndChild(settledText),
      listProjects: projectExists,
      updateTaskTitle,
    });

    await sync.run(PROJECT);

    expect(updateTaskTitle).not.toHaveBeenCalled();
  });

  it('pushes the text of a line that became description text in its parent\'s description', async () => {
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(new FakeNote(`${PARENT_LINE}\n${TEXT_LINE}`), linksForSyncedChild(''), {
      listTasks: remoteParentAndChild(''),
      listProjects: projectExists,
      updateTaskDescription,
    });

    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledWith(
      'parent-task',
      composeRemoteDescription(PUSHED_TEXT, 'ots-parent1'),
    );
  });

  it('does not pull the task of a line that became description text back in as a new task line', async () => {
    const note = new FakeNote(`${PARENT_LINE}\n${TEXT_LINE}`);
    const sync = makeSync(note, linksForSyncedChild(PUSHED_TEXT), {
      listTasks: remoteParentAndChild(PUSHED_TEXT),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content).toBe(`${PARENT_LINE}\n${TEXT_LINE}`);
  });

  it('flags the task of a line that became description text after 60 minutes, as its line is no task', async () => {
    jest.useFakeTimers();
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote(`${PARENT_LINE}\n${TEXT_LINE}`),
      linksForSyncedChild(PUSHED_TEXT),
      { listTasks: remoteParentAndChild(PUSHED_TEXT), listProjects: projectExists, updateTaskDescription },
      { orphans: new OrphanTracker(), existsOutsideIgnoredFiles: () => true },
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60 * 60_000);
    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledWith('child-task', expect.any(String));
  });

  it('does not move a task under a checkbox line that is description text', async () => {
    const original = '- [ ] A ^ots-a\n\t\t- [ ] B ^ots-b\n- [ ] C ^ots-c';
    const note = new FakeNote(original);
    const links = new TaskLinkStore([
      { blockId: 'ots-a', providerTaskId: 'task-a', lastSyncedTitle: 'A', lastSyncedDescription: '\t- [ ] B ^ots-b' },
      { blockId: 'ots-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'ots-a' },
      { blockId: 'ots-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        {
          id: 'task-a',
          title: 'A',
          embeddedBlockId: 'ots-a',
          description: composeRemoteDescription('\t- [ ] B ^ots-b', 'ots-a'),
        },
        { id: 'task-b', title: 'B', embeddedBlockId: 'ots-b', parentId: 'task-a' },
        { id: 'task-c', title: 'C', embeddedBlockId: 'ots-c', parentId: 'task-b' },
      ),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content).toBe(original);
  });
});

describe('CrossFileParentSync with a checkbox line inside a description', () => {
  it('does not relocate a task under a new parent whose line is description text', async () => {
    const source = new FakeNote('- [ ] C ^ots-c');
    const target = new FakeNote('- [ ] A ^ots-a\n\t\t- [ ] B ^ots-b');
    const links = new TaskLinkStore([{ blockId: 'ots-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' }]);
    const relocation = new CrossFileParentSync({
      links,
      noteFor: (path) => (path === 'Target.md' ? target : source),
    });

    const relocated = await relocation.run([
      { blockId: 'ots-c', sourcePath: 'Source.md', targetPath: 'Target.md', newParentBlockId: 'ots-b' },
    ]);

    expect(relocated).toBe(0);
  });
});
