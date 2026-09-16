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
