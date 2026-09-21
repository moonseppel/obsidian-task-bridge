import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { StubProviderOptions } from '../../../support/stub-provider';
import { FakeNote, PROJECT, TASK_ID, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

const TASKS_ENABLED = { isTasksPluginEnabled: (): Promise<boolean> => Promise.resolve(true) };

describe('TaskSync with the Tasks plugin enabled, without status settings', () => {
  it.each(['/', '-', 'X'])('pushes [%s] as completed', async (marker) => {
    const note = new FakeNote(`- [${marker}] Buy milk ^tb-a1`);
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: false },
    ]);
    const calls: string[] = [];
    const provider: StubProviderOptions = {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      completeTask: async () => {
        calls.push('complete');
      },
    };

    await makeSync(note, links, provider, TASKS_ENABLED).run(PROJECT);

    expect(calls).toEqual(['complete']);
  });

  it('leaves [/] alone when the task is completed in the provider', async () => {
    const note = new FakeNote('- [/] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: false },
    ]);
    const sync = makeSync(
      note,
      links,
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', isCompleted: true }) },
      TASKS_ENABLED,
    );

    await sync.run(PROJECT);

    expect(note.content).toBe('- [/] Buy milk ^tb-a1');
  });

  it('writes [ ] when the task is reopened in the provider', async () => {
    const note = new FakeNote('- [x] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: true },
    ]);
    const sync = makeSync(note, links, { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }) }, TASKS_ENABLED);

    await sync.run(PROJECT);

    expect(note.content).toBe('- [ ] Buy milk ^tb-a1');
  });

  it('creates a new [/] line completed', async () => {
    const calls: string[] = [];
    const sync = makeSync(
      new FakeNote('- [/] Buy milk'),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks(),
        listProjects: projectExists,
        createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
        completeTask: async () => {
          calls.push('complete');
        },
      },
      TASKS_ENABLED,
    );

    await sync.run(PROJECT);

    expect(calls).toEqual(['complete']);
  });
});
