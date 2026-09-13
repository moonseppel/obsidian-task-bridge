import { TaskLinkStore } from '../services/sync/task-links';
import { NewTask } from '../services/task-provider';
import { TaskProviderError } from '../services/task-provider-error';
import {
  FakeNote,
  INBOX,
  PROJECT,
  TASK_ID,
  makeSync,
  projectExists,
  remoteTasks,
} from './support/sync-harness';

describe('TaskSync project resolution', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('falls back to the default project when the configured one is gone', async () => {
    const created: NewTask[] = [];
    const sync = makeSync(new FakeNote('- [ ] Buy milk'), new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: () => Promise.resolve([INBOX]),
      createTask: (task) => {
        created.push(task);
        return Promise.resolve({ id: TASK_ID, title: task.title });
      },
    });

    const outcome = await sync.run(PROJECT);

    expect(outcome.projectResolution).toEqual({ kind: 'replaced', project: INBOX });
    expect(created).toMatchObject([{ title: 'Buy milk', projectId: INBOX.id }]);
  });

  it('uses the default project when none has been configured yet', async () => {
    const created: NewTask[] = [];
    const sync = makeSync(new FakeNote('- [ ] Buy milk'), new TaskLinkStore(), {
      listProjects: projectExists,
      listTasks: remoteTasks(),
      createTask: (task) => {
        created.push(task);
        return Promise.resolve({ id: TASK_ID, title: task.title });
      },
    });

    const outcome = await sync.run('');

    expect(outcome.projectResolution).toEqual({ kind: 'defaulted', project: INBOX });
    expect(created).toMatchObject([{ title: 'Buy milk', projectId: INBOX.id }]);
  });

  it('settles for the first project when the provider names no default', async () => {
    const sync = makeSync(new FakeNote(''), new TaskLinkStore(), {
      listProjects: () => Promise.resolve([{ id: 'only', name: 'Only', isDefault: false }]),
      listTasks: remoteTasks(),
    });

    expect((await sync.run('')).projectResolution).toMatchObject({
      kind: 'defaulted',
      project: { id: 'only' },
    });
  });

  it('gives up only when the provider lists no projects at all', async () => {
    const sync = makeSync(new FakeNote(''), new TaskLinkStore(), {
      listProjects: () => Promise.resolve([]),
    });

    await expect(sync.run('')).rejects.toMatchObject({ failure: 'project-missing' });
  });

  it('does not go looking for the project when the list came back with tasks in it', async () => {
    const listProjects = jest.fn();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(new FakeNote('- [ ] Buy milk ^ots-a1'), links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      listProjects,
    });

    await sync.run(PROJECT);

    expect(listProjects).not.toHaveBeenCalled();
  });

  it('keeps the work it finished when a later call fails', async () => {
    const note = new FakeNote('- [ ] First\n- [ ] Second');
    const links = new TaskLinkStore();
    let calls = 0;
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => {
        calls += 1;
        return calls === 1
          ? Promise.resolve({ id: TASK_ID, title: task.title })
          : Promise.reject(new TaskProviderError('rate-limited'));
      },
    });

    await expect(sync.run(PROJECT)).rejects.toMatchObject({ failure: 'rate-limited' });
    expect(note.content).toMatch(/^- \[ \] First \^ots-[a-z0-9]{8}\n- \[ \] Second$/);
    expect(links.size).toBe(1);
  });

  it('saves the links even when the pass fails, so no task is created twice', async () => {
    const note = new FakeNote('- [ ] First');
    let saved = 0;
    const sync = makeSync(
      note,
      new TaskLinkStore(),
      {
        listTasks: remoteTasks(),
        listProjects: projectExists,
        createTask: () => Promise.reject(new TaskProviderError('unreachable')),
      },
      {
        onSave: () => {
          saved += 1;
        },
      },
    );

    await expect(sync.run(PROJECT)).rejects.toThrow();
    expect(saved).toBe(1);
  });
});
