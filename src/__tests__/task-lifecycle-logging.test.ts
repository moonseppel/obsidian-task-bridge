import { OrphanTracker } from '../services/sync/orphan-tracker';
import { TaskLinkStore } from '../services/sync/task-links';
import { Logger } from '../utils/logger';
import { FakeNote, PROJECT, TASK_ID, makeSync, projectExists, remoteTasks } from './support/sync-harness';

const GRACE_MS = 60_000;

function infoLogged(): jest.SpyInstance {
  return jest.spyOn(Logger.prototype, 'info').mockImplementation();
}

function linkedTo(title: string): TaskLinkStore {
  return new TaskLinkStore([{ blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: title }]);
}

describe('TaskSync logs every task and task line it creates or deletes at info', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('logs a task created for a new line', async () => {
    const info = infoLogged();
    const sync = makeSync(new FakeNote('- [ ] Buy milk'), new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: 'created-task', title: task.title }),
    });

    await sync.run(PROJECT);

    expect(info).toHaveBeenCalledWith(
      'Created a task for a new line',
      expect.objectContaining({ taskId: 'created-task' }),
    );
  });

  it('logs a task recreated because its line carried a newer edit than the deletion', async () => {
    const info = infoLogged();
    const sync = makeSync(new FakeNote('- [ ] Buy oat milk ^tb-a1'), linkedTo('Buy milk'), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve(undefined),
      createTask: (task) => Promise.resolve({ id: 'recreated-task', title: task.title }),
    });

    await sync.run(PROJECT);

    expect(info).toHaveBeenCalledWith(
      'Recreated a task deleted in Todoist, since its line carried a newer edit',
      expect.objectContaining({ taskId: 'recreated-task' }),
    );
  });

  it('logs a line removed because its task was deleted in Todoist', async () => {
    const info = infoLogged();
    const sync = makeSync(new FakeNote('- [ ] Buy milk ^tb-a1'), linkedTo('Buy milk'), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve(undefined),
    });

    await sync.run(PROJECT);

    expect(info).toHaveBeenCalledWith(
      'Removing the line of a task deleted in Todoist',
      expect.objectContaining({ blockId: 'tb-a1' }),
    );
  });

  it('logs a task deleted because its line is gone from every note', async () => {
    jest.useFakeTimers();
    const info = infoLogged();
    const sync = makeSync(new FakeNote(''), linkedTo('Buy milk'), {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'tb-a1' }),
      removeTask: () => Promise.resolve(),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(GRACE_MS);
    await sync.run(PROJECT);

    expect(info).toHaveBeenCalledWith(
      'Deleted the task of a line that is gone from every note',
      expect.objectContaining({ taskId: TASK_ID }),
    );
  });

  it('logs an orphaned task deleted once its removal date passed', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const info = infoLogged();
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 0);
    orphans.flag(TASK_ID, 5_000);
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'tb-orphan' }),
        removeTask: () => Promise.resolve(),
      },
      { orphans },
    );

    await sync.run(PROJECT);

    expect(info).toHaveBeenCalledWith(
      'Deleted an orphaned task once its removal date passed',
      expect.objectContaining({ taskId: TASK_ID }),
    );
  });

  it('logs a deleted line added back because its task was edited in Todoist afterwards', async () => {
    jest.useFakeTimers();
    const info = infoLogged();
    const sync = makeSync(new FakeNote(''), linkedTo('Buy milk'), {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy oat milk', embeddedBlockId: 'tb-a1', updatedAt: 1_000 }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(GRACE_MS);
    await sync.run(PROJECT);

    expect(info).toHaveBeenCalledWith(
      'Re-added a deleted line, since its task was edited in Todoist afterwards',
      expect.objectContaining({ blockId: 'tb-a1' }),
    );
  });

  it('logs a line added for a sub-task created in Todoist', async () => {
    const info = infoLogged();
    const links = new TaskLinkStore([{ blockId: 'tb-p', providerTaskId: 'parent-task', lastSyncedTitle: 'Parent' }]);
    const sync = makeSync(new FakeNote('- [ ] Parent ^tb-p'), links, {
      listTasks: remoteTasks(
        { id: 'parent-task', title: 'Parent', embeddedBlockId: 'tb-p' },
        { id: 'child-task', title: 'Child', parentId: 'parent-task' },
      ),
    });

    await sync.run(PROJECT);

    expect(info).toHaveBeenCalledWith(
      'Adding a line for a sub-task created in Todoist',
      expect.objectContaining({ taskId: 'child-task' }),
    );
  });
});
