import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { NewTask } from '../../../../services/task-provider';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

const TASKS_ENABLED = { isTasksPluginEnabled: (): Promise<boolean> => Promise.resolve(true) };

describe('TaskSync ignoring completed tasks', () => {
  describe('a completed line never synced', () => {
    it.each(['x', '-'])('is not created for [%s]', async (marker) => {
      const created: NewTask[] = [];
      const sync = makeSync(
        new FakeNote(`- [${marker}] Call the dentist`),
        new TaskLinkStore(),
        {
          listTasks: remoteTasks(),
          listProjects: projectExists,
          createTask: (task) => {
            created.push(task);
            return Promise.resolve({ id: 'task-1', title: task.title });
          },
        },
        TASKS_ENABLED,
      );

      await sync.run(PROJECT);

      expect(created).toEqual([]);
    });

    it('is given no block id', async () => {
      const note = new FakeNote('- [x] Call the dentist');
      const sync = makeSync(note, new TaskLinkStore(), { listTasks: remoteTasks(), listProjects: projectExists });

      await sync.run(PROJECT);

      expect(note.content).toBe('- [x] Call the dentist');
    });
  });
});
