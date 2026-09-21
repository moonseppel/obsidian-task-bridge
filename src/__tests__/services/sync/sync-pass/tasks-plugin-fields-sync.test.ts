import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { NewTask } from '../../../../services/task-provider';
import { FakeNote, PROJECT, TASK_ID, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

const TASKS_ENABLED = { isTasksPluginEnabled: (): Promise<boolean> => Promise.resolve(true) };

function linkedAs(lastSyncedTitle: string, lastSyncedTags: string[] = []): TaskLinkStore {
  return new TaskLinkStore([{ blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle, lastSyncedTags }]);
}

describe('TaskSync with Tasks plugin fields in a line', () => {
  it('creates a task titled without the fields', async () => {
    const created: NewTask[] = [];
    const sync = makeSync(
      new FakeNote('- [ ] Buy milk 📅 2026-09-20'),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks(),
        listProjects: projectExists,
        createTask: (task) => {
          created.push(task);
          return Promise.resolve({ id: TASK_ID, title: task.title });
        },
      },
      TASKS_ENABLED,
    );

    await sync.run(PROJECT);

    expect(created.map((task) => task.title)).toEqual(['Buy milk']);
  });

  it('pushes a tag standing among the fields as a label', async () => {
    const labels: Array<readonly string[]> = [];
    const sync = makeSync(
      new FakeNote('- [ ] Buy milk 📅 2026-09-20 #errands ^tb-a1'),
      linkedAs('Buy milk'),
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
        updateTaskLabels: async (_id, pushed) => {
          labels.push(pushed);
        },
      },
      TASKS_ENABLED,
    );

    await sync.run(PROJECT);

    expect(labels).toEqual([['errands']]);
  });

  it('keeps the fields in the line when a changed title is pulled', async () => {
    const note = new FakeNote('- [ ] Buy milk #errands 📅 2026-09-20 ^tb-a1');
    const sync = makeSync(
      note,
      linkedAs('Buy milk', ['errands']),
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy oat milk', labels: ['errands'] }) },
      TASKS_ENABLED,
    );

    await sync.run(PROJECT);

    expect(note.content).toBe('- [ ] Buy oat milk #errands 📅 2026-09-20 ^tb-a1');
  });

  it('cleans the text of fields out of a title synced before, with one push', async () => {
    const titles: string[] = [];
    const sync = makeSync(
      new FakeNote('- [ ] Buy milk 📅 2026-09-20 ^tb-a1'),
      linkedAs('Buy milk 📅 2026-09-20'),
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk 📅 2026-09-20' }),
        updateTaskTitle: async (_id, title) => {
          titles.push(title);
        },
      },
      TASKS_ENABLED,
    );

    await sync.run(PROJECT);

    expect(titles).toEqual(['Buy milk']);
  });

  it('stays settled once the cleaned title is in the provider', async () => {
    const links = linkedAs('Buy milk 📅 2026-09-20');
    const note = new FakeNote('- [ ] Buy milk 📅 2026-09-20 ^tb-a1');
    const remote = { id: TASK_ID, title: 'Buy milk 📅 2026-09-20' };
    const sync = makeSync(
      note,
      links,
      {
        listTasks: async () => [remote],
        updateTaskTitle: async (_id, title) => {
          remote.title = title;
        },
      },
      TASKS_ENABLED,
    );
    await sync.run(PROJECT);

    expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
  });

  it('keeps the fields part of the title without the Tasks plugin', async () => {
    const sync = makeSync(new FakeNote('- [ ] Buy milk 📅 2026-09-20 ^tb-a1'), linkedAs('Buy milk 📅 2026-09-20'), {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk 📅 2026-09-20' }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
  });
});
