import { TaskLinkStore } from '../services/sync/task-links';
import { FakeNote, PROJECT, bareBlockIdDescription, makeSync, projectExists, remoteTasks } from './support/sync-harness';

const TASK_LINE = '- [ ] Test for complex description ^tb-space1';

function linkedTask(): TaskLinkStore {
  return new TaskLinkStore([
    {
      blockId: 'tb-space1',
      providerTaskId: 'task-1',
      lastSyncedTitle: 'Test for complex description',
      lastSyncedDescription: '',
    },
  ]);
}

const remoteTask = remoteTasks({
  id: 'task-1',
  title: 'Test for complex description',
  embeddedBlockId: 'tb-space1',
  description: bareBlockIdDescription('tb-space1'),
});

describe('TaskSync reading the editor tab size', () => {
  it('counts a run of that many spaces as one indent level', async () => {
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote(`${TASK_LINE}\n  Indented with two spaces`);
    const sync = makeSync(note, linkedTask(), {
      listTasks: remoteTask,
      listProjects: projectExists,
      updateTaskDescription,
    }, { readTabSize: () => 2 });

    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledWith('task-1', expect.stringContaining('Indented with two spaces'));
  });

  it('leaves a shorter run of spaces outside the description', async () => {
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote(`${TASK_LINE}\n  Indented with two spaces`);
    const sync = makeSync(note, linkedTask(), {
      listTasks: remoteTask,
      listProjects: projectExists,
      updateTaskDescription,
    }, { readTabSize: () => 4 });

    await sync.run(PROJECT);

    expect(updateTaskDescription).not.toHaveBeenCalled();
  });

  it('reads the setting once per run, however many lines the run counts', async () => {
    const readTabSize = jest.fn().mockReturnValue(4);
    const note = new FakeNote(`${TASK_LINE}\n\tOne\n\tTwo`);
    const sync = makeSync(
      note,
      linkedTask(),
      { listTasks: remoteTask, listProjects: projectExists, updateTaskDescription: jest.fn().mockResolvedValue(undefined) },
      { readTabSize },
    );

    await sync.run(PROJECT);

    expect(readTabSize).toHaveBeenCalledTimes(1);
  });

  it('falls back to counting by four when the setting cannot be read', async () => {
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote(`${TASK_LINE}\n    Indented with four spaces`);
    const sync = makeSync(note, linkedTask(), {
      listTasks: remoteTask,
      listProjects: projectExists,
      updateTaskDescription,
    }, { readTabSize: () => undefined });

    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledWith('task-1', expect.stringContaining('Indented with four spaces'));
  });
});

/** The lines the manual test found stopping after one line: a bullet, then Obsidian's own soft break. */
const COMPLEX_DESCRIPTION_NOTE = [
  TASK_LINE,
  '\t- this is a bullet point in the description.',
  '      This should still be part of the bullet point.',
  '\tThis should not be part of the bullet point, but part of the description.',
  '',
].join('\n');

const PUSHED_DESCRIPTION = [
  '- this is a bullet point in the description.',
  '  This should still be part of the bullet point.',
  'This should not be part of the bullet point, but part of the description.',
].join('\n');

describe('TaskSync with a description Obsidian soft-broke into space indentation', () => {
  it('pushes the whole description rather than stopping at the space-indented line', async () => {
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(new FakeNote(COMPLEX_DESCRIPTION_NOTE), linkedTask(), {
      listTasks: remoteTask,
      listProjects: projectExists,
      updateTaskDescription,
    });

    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledWith(
      'task-1',
      bareBlockIdDescription('tb-space1', PUSHED_DESCRIPTION),
    );
  });

  it('settles once pushed, leaving the note and the task alone on the next run', async () => {
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote(COMPLEX_DESCRIPTION_NOTE);
    const links = linkedTask();
    const settled = remoteTasks({
      id: 'task-1',
      title: 'Test for complex description',
      embeddedBlockId: 'tb-space1',
      description: bareBlockIdDescription('tb-space1', PUSHED_DESCRIPTION),
    });

    await makeSync(note, links, { listTasks: remoteTask, listProjects: projectExists, updateTaskDescription }).run(
      PROJECT,
    );
    await makeSync(note, links, { listTasks: settled, listProjects: projectExists, updateTaskDescription }).run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledTimes(1);
    expect(note.content).toBe(COMPLEX_DESCRIPTION_NOTE);
  });
});
