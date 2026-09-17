import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { NewTask } from '../../../../services/task-provider';
import {
  FakeNote,
  PROJECT,
  TASK_ID,
  makeSync,
  projectExists,
  remoteTasks,
} from '../../../support/sync-harness';

describe('TaskSync deletion and completion', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('removes the line when its linked task was deleted in the provider', async () => {
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve(undefined),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ removedLine: 1 });
    expect(note.content).toBe('');
    expect(links.get('tb-a1')).toBeUndefined();
  });

  it('keeps syncing a task that turns out to have moved to another project', async () => {
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Get milk', projectId: 'some-other-project' }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ removedLine: 0, removedTask: 0, pulled: 1 });
    expect(note.content).toBe('- [ ] Get milk ^tb-a1');
    expect(links.get('tb-a1')).toMatchObject({
      providerTaskId: TASK_ID,
      lastSyncedTitle: 'Get milk',
    });
  });

  it('pushes a local edit to a task that has moved to another project, without moving it back', async () => {
    const note = new FakeNote('- [ ] Get milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const updatedTitles: Array<[string, string]> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: 'some-other-project' }),
      updateTaskTitle: (taskId, title) => {
        updatedTitles.push([taskId, title]);
        return Promise.resolve();
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ pushed: 1 });
    expect(updatedTitles).toEqual([[TASK_ID, 'Get milk']]);
    expect(note.content).toBe('- [ ] Get milk ^tb-a1');
  });

  it('checks the line off when its linked task turns out to have been completed remotely', async () => {
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: false },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: PROJECT, isCompleted: true }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ removedLine: 0, removedTask: 0, pulled: 1 });
    expect(note.content).toBe('- [x] Buy milk ^tb-a1');
    expect(links.get('tb-a1')?.lastSyncedDone).toBe(true);
  });

  it('does nothing more when a completed task is found and the line is already checked', async () => {
    const note = new FakeNote('- [x] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: false },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: PROJECT, isCompleted: true }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
    expect(note.content).toBe('- [x] Buy milk ^tb-a1');
    expect(links.get('tb-a1')?.lastSyncedDone).toBe(true);
  });

  // A completed task found here is a known constant, not itself in question, so the local edit
  // always wins outright rather than by recency: there is no timestamp comparison to make when
  // only one side actually moved.
  it('reopens a completed task when the line was independently unchecked', async () => {
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: true },
    ]);
    const reopened: string[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: PROJECT, isCompleted: true }),
      reopenTask: (id) => {
        reopened.push(id);
        return Promise.resolve();
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 0 });
    expect(reopened).toEqual([TASK_ID]);
    expect(links.get('tb-a1')?.lastSyncedDone).toBe(false);
  });

  it('recreates the task when it was deleted remotely but the line carries an edited title', async () => {
    const note = new FakeNote('- [ ] Buy oat milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const created: NewTask[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve(undefined),
      createTask: (task) => {
        created.push(task);
        return Promise.resolve({ id: 'new-task-id', title: task.title });
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ conflicted: 1, recreatedTask: 1, removedLine: 0 });
    expect(created).toEqual([
      { title: 'Buy oat milk', projectId: PROJECT, description: 'TaskBridge ID: ^tb-a1', labels: [] },
    ]);
    expect(note.content).toBe('- [ ] Buy oat milk ^tb-a1');
    expect(links.get('tb-a1')).toEqual({
      blockId: 'tb-a1',
      providerTaskId: 'new-task-id',
      lastSyncedTitle: 'Buy oat milk',
      lastSyncedDescription: '',
      lastSyncedTags: [],
      lastKnownFilePath: 'Tasks.md',
    });
  });

  it('does nothing the first time a linked line goes missing from the note', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn();
    const sync = makeSync(new FakeNote('# Nothing here'), links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      removeTask,
    });

    expect(await sync.run(PROJECT)).toMatchObject({ removedTask: 0 });
    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('tb-a1')).toBeDefined();
  });

  it('still does nothing 59 seconds after a linked line went missing', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn();
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(59_000);
    await sync.run(PROJECT);

    expect(removeTask).not.toHaveBeenCalled();
  });

  it('removes the linked task once a missing line has stayed missing for 60 seconds', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ removedTask: 1 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    expect(links.get('tb-a1')).toBeUndefined();
  });

  it('resurrects the line when the remote edit is newer than the note', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const note = new FakeNote('# Nothing here');
    note.modifiedAt = 1_000;
    const removeTask = jest.fn();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy oat milk', updatedAt: 2_000 }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ conflicted: 1, resurrectedLine: 1, removedTask: 0 });
    expect(removeTask).not.toHaveBeenCalled();
    expect(note.content).toBe('# Nothing here\n- [ ] Buy oat milk ^tb-a1');
    expect(links.get('tb-a1')?.lastSyncedTitle).toBe('Buy oat milk');
  });

  it('deletes the task instead of resurrecting the line when the note is no older than the remote edit', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const note = new FakeNote('# Nothing here');
    note.modifiedAt = 2_000;
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy oat milk', updatedAt: 2_000 }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ conflicted: 1, removedTask: 1, resurrectedLine: 0 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    expect(links.get('tb-a1')).toBeUndefined();
  });

  it('deletes the task when the remote edit carries no last-modified time to compare', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(new FakeNote('# Nothing here'), links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy oat milk' }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ conflicted: 1, removedTask: 1 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
  });

  it('drops the link without calling removeTask once a direct lookup confirms the task is gone too', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn();
    const getTask = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      removeTask,
      getTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    expect(getTask).toHaveBeenCalledWith(TASK_ID);
    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('tb-a1')).toBeUndefined();
  });

  it('leaves the link alone when a line-missing task turns out to have just moved to another project', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn();
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      removeTask,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: 'some-other-project' }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('tb-a1')).toBeDefined();
  });

  it('removes a task that turns out to have been completed once its line has already gone missing', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      removeTask,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: PROJECT, isCompleted: true }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ removedTask: 1 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    expect(links.get('tb-a1')).toBeUndefined();
  });

  it('stops tracking a missing line that reappears in the note before the grace period is up', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      removeTask,
    });

    await sync.run(PROJECT);
    note.content = '- [ ] Buy milk ^tb-a1';
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('tb-a1')).toBeDefined();
  });
});
