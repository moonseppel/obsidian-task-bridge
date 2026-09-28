import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { NewTask } from '../../../../services/task-provider';
import { StubProviderOptions } from '../../../support/stub-provider';
import { FakeNote, PROJECT, TASK_ID, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

const TASKS_ENABLED = { isTasksPluginEnabled: (): Promise<boolean> => Promise.resolve(true) };

function completedOnBothSides(): TaskLinkStore {
  return new TaskLinkStore([
    { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: true, lastSyncedDescription: '' },
  ]);
}

/** A task completed in Todoist, which its active list leaves out, recording every call made about it. */
function completedInTodoist(calls: string[]): StubProviderOptions {
  const record = (call: string) => async (): Promise<void> => {
    calls.push(call);
  };

  return {
    listTasks: remoteTasks(),
    listProjects: projectExists,
    getTask: (id) => {
      calls.push('getTask');
      return Promise.resolve({ id, title: 'Buy milk', projectId: PROJECT, isCompleted: true });
    },
    updateTaskTitle: record('updateTaskTitle'),
    updateTaskDescription: record('updateTaskDescription'),
    reopenTask: record('reopenTask'),
  };
}

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

  describe('a task completed on both sides', () => {
    it('is not looked up in Todoist', async () => {
      const calls: string[] = [];
      const sync = makeSync(new FakeNote('- [x] Buy milk ^tb-a1'), completedOnBothSides(), completedInTodoist(calls));

      await sync.run(PROJECT);

      expect(calls).toEqual([]);
    });

    it('stays completed in the note', async () => {
      const note = new FakeNote('- [x] Buy milk ^tb-a1');
      const sync = makeSync(note, completedOnBothSides(), completedInTodoist([]));

      await sync.run(PROJECT);

      expect(note.content).toBe('- [x] Buy milk ^tb-a1');
    });

    it('keeps its edits back while the line stays checked', async () => {
      const calls: string[] = [];
      const note = new FakeNote('- [x] Buy oat milk ^tb-a1\n\tThe barista kind');
      const sync = makeSync(note, completedOnBothSides(), completedInTodoist(calls));

      await sync.run(PROJECT);

      expect(calls).toEqual([]);
    });

    it('pushes the uncheck together with the edits kept back', async () => {
      const calls: string[] = [];
      const note = new FakeNote('- [ ] Buy oat milk ^tb-a1\n\tThe barista kind');
      const sync = makeSync(note, completedOnBothSides(), completedInTodoist(calls));

      await sync.run(PROJECT);

      expect(calls).toEqual(['getTask', 'updateTaskTitle', 'reopenTask', 'updateTaskDescription']);
    });
  });
});
