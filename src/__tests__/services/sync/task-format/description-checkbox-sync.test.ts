import { CrossFileParentSync } from '../../../../services/sync/sync-pass/cross-file-parent-sync';
import { OrphanTracker } from '../../../../services/sync/orphans/orphan-tracker';
import { composeRemoteDescription } from '../../../../services/sync/task-format/task-footer';
import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { LooseProviderTask } from '../../../support/stub-provider';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

const PARENT_LINE = '- [ ] another nesting test ^tb-parent1';
const TEXT_LINE = '\t\t- [ ] direct grandchild ^tb-child1';
const PUSHED_TEXT = '\t- [ ] direct grandchild ^tb-child1';

/** A child synced as a task of its own before its line became the parent's description text. */
function linksForSyncedChild(parentDescription: string): TaskLinkStore {
  return new TaskLinkStore([
    {
      blockId: 'tb-parent1',
      providerTaskId: 'parent-task',
      lastSyncedTitle: 'another nesting test',
      lastSyncedDescription: parentDescription,
    },
    {
      blockId: 'tb-child1',
      providerTaskId: 'child-task',
      lastSyncedTitle: 'direct grandchild',
      lastSyncedParentBlockId: 'tb-parent1',
    },
  ]);
}

function remoteParentAndChild(parentDescription: string): () => Promise<LooseProviderTask[]> {
  return remoteTasks(
    {
      id: 'parent-task',
      title: 'another nesting test',
      embeddedBlockId: 'tb-parent1',
      description: composeRemoteDescription(parentDescription, 'tb-parent1'),
    },
    {
      id: 'child-task',
      title: 'direct grandchild',
      embeddedBlockId: 'tb-child1',
      parentId: 'parent-task',
      description: composeRemoteDescription('', 'tb-child1'),
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
    const renamedLine = '\t\t- [ ] direct grandchild renamed ^tb-child1';
    const settledText = '\t- [ ] direct grandchild renamed ^tb-child1';
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
      composeRemoteDescription(PUSHED_TEXT, 'tb-parent1'),
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
    const original = '- [ ] A ^tb-a\n\t\t- [ ] B ^tb-b\n- [ ] C ^tb-c';
    const note = new FakeNote(original);
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'task-a', lastSyncedTitle: 'A', lastSyncedDescription: '\t- [ ] B ^tb-b' },
      { blockId: 'tb-b', providerTaskId: 'task-b', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'tb-a' },
      { blockId: 'tb-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(
        {
          id: 'task-a',
          title: 'A',
          embeddedBlockId: 'tb-a',
          description: composeRemoteDescription('\t- [ ] B ^tb-b', 'tb-a'),
        },
        { id: 'task-b', title: 'B', embeddedBlockId: 'tb-b', parentId: 'task-a' },
        { id: 'task-c', title: 'C', embeddedBlockId: 'tb-c', parentId: 'task-b' },
      ),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);

    expect(note.content).toBe(original);
  });
});

describe('CrossFileParentSync with a checkbox line inside a description', () => {
  it('does not relocate a task under a new parent whose line is description text', async () => {
    const source = new FakeNote('- [ ] C ^tb-c');
    const target = new FakeNote('- [ ] A ^tb-a\n\t\t- [ ] B ^tb-b');
    const links = new TaskLinkStore([{ blockId: 'tb-c', providerTaskId: 'task-c', lastSyncedTitle: 'C' }]);
    const relocation = new CrossFileParentSync({
      links,
      noteFor: (path) => (path === 'Target.md' ? target : source),
    });

    const relocated = await relocation.run([
      { blockId: 'tb-c', sourcePath: 'Source.md', targetPath: 'Target.md', newParentBlockId: 'tb-b' },
    ]);

    expect(relocated).toBe(0);
  });
});
