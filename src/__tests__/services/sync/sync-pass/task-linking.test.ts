import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import {
  FakeNote,
  PROJECT,
  TASK_ID,
  makeSync,
  projectExists,
  remoteTasks,
} from '../../../support/sync-harness';

describe('TaskSync linking and block ids', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reuses an orphaned block id rather than adding a second anchor to the line', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^tb-orphan');
    const links = new TaskLinkStore();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect((await sync.run(PROJECT)).created).toBe(1);
    expect(note.content).toBe('- [ ] Buy milk ^tb-orphan');
    expect(links.get('tb-orphan')?.providerTaskId).toBe(TASK_ID);
  });

  it('re-links to a task already anchored with this block id instead of creating a duplicate', async () => {
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore();
    const createTask = jest.fn();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'tb-a1' }),
      createTask,
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 0, pulled: 0 });
    expect(createTask).not.toHaveBeenCalled();
    expect(links.get('tb-a1')).toEqual({
      blockId: 'tb-a1',
      providerTaskId: TASK_ID,
      lastSyncedTitle: 'Buy milk',
      lastKnownFilePath: 'Tasks.md',
    });
  });

  it('creates a task as usual when no already-anchored task matches the block id', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'other-task', title: 'Unrelated', embeddedBlockId: 'tb-other' }),
      createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect((await sync.run(PROJECT)).created).toBe(1);
    expect(links.get('tb-a1')?.providerTaskId).toBe(TASK_ID);
  });

  it('does not create a task the first time an unmatched block id is seen', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const createTask = jest.fn();
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask,
    });

    expect((await sync.run(PROJECT)).created).toBe(0);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('still creates nothing on a second sighting inside the 60-second grace period', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const createTask = jest.fn();
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(59_000);

    expect((await sync.run(PROJECT)).created).toBe(0);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('creates the task once the grace period has passed', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect((await sync.run(PROJECT)).created).toBe(1);
  });

  it('drops the tracking for a block id that disappears from the note before the grace period is up', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^tb-a1');
    const createTask = jest.fn().mockResolvedValue({ id: TASK_ID, title: 'Buy milk' });
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask,
    });

    await sync.run(PROJECT);
    note.content = '# Not a task line';
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    note.content = '- [ ] Buy milk ^tb-a1';
    expect((await sync.run(PROJECT)).created).toBe(0);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('never mints a block id that another line already carries', async () => {
    const note = new FakeNote('- [ ] First ^tb-taken\n- [ ] Second');
    const links = new TaskLinkStore([
      { blockId: 'tb-taken', providerTaskId: 'other', lastSyncedTitle: 'First' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'other', title: 'First' }),
      createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
    });

    await sync.run(PROJECT);

    expect(note.content.split('\n')[1]).not.toContain('tb-taken');
  });

  it('skips lines that are not tasks and tasks with no title', async () => {
    const note = new FakeNote('# Heading\n- Plain bullet\n- [ ]  \nProse');
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 0, pulled: 0 });
  });
});
