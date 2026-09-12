import { TaskLinkStore } from '../services/sync/task-links';
import { NewTask } from '../services/task-provider';
import {
  FakeNote,
  PROJECT,
  TASK_ID,
  makeSync,
  projectExists,
  remoteTasks,
} from './support/sync-harness';

describe('TaskSync field sync', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('state sync', () => {
    it('completes the task when the line is checked locally', async () => {
      const note = new FakeNote('- [x] Buy milk ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: false },
      ]);
      const completed: string[] = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
        completeTask: (id) => {
          completed.push(id);
          return Promise.resolve();
        },
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 0 });
      expect(completed).toEqual([TASK_ID]);
      expect(links.get('ots-a1')?.lastSyncedDone).toBe(true);
    });

    it('treats a link with no recorded state as not done, so an already-checked line pushes a completion', async () => {
      const note = new FakeNote('- [x] Buy milk ^ots-a1');
      const links = new TaskLinkStore([{ blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' }]);
      const completed: string[] = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
        completeTask: (id) => {
          completed.push(id);
          return Promise.resolve();
        },
      });

      await sync.run(PROJECT);

      expect(completed).toEqual([TASK_ID]);
    });

    it('clears the checkbox when the task was reopened in Todoist', async () => {
      const note = new FakeNote('- [x] Buy milk ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: true },
      ]);
      const sync = makeSync(note, links, {
        // Still present in the active list at all means Todoist now considers it not completed.
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 1 });
      expect(note.content).toBe('- [ ] Buy milk ^ots-a1');
      expect(links.get('ots-a1')?.lastSyncedDone).toBe(false);
    });

    it('settles silently when both sides already dropped the completion, without calling the provider', async () => {
      const note = new FakeNote('- [ ] Buy milk ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: true },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
      expect(links.get('ots-a1')?.lastSyncedDone).toBe(false);
    });

    it('does nothing when both sides already agree the task is not done', async () => {
      const note = new FakeNote('- [ ] Buy milk ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: false },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
      expect(note.saves).toBe(0);
    });

    it('syncs title and state independently in the same pass', async () => {
      const note = new FakeNote('- [x] Buy oat milk ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: false },
      ]);
      const pushedTitles: string[] = [];
      const completed: string[] = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
        updateTaskTitle: (_id, title) => {
          pushedTitles.push(title);
          return Promise.resolve();
        },
        completeTask: (id) => {
          completed.push(id);
          return Promise.resolve();
        },
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 2 });
      expect(pushedTitles).toEqual(['Buy oat milk']);
      expect(completed).toEqual([TASK_ID]);
      expect(links.get('ots-a1')).toMatchObject({ lastSyncedTitle: 'Buy oat milk', lastSyncedDone: true });
    });
  });

  describe('description sync', () => {
    it('pushes a newly added indented description', async () => {
      const note = new FakeNote('- [ ] Buy milk ^ots-a1\n\tOat milk, not regular');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDescription: '' },
      ]);
      const updated: Array<[string, string]> = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
        updateTaskDescription: (id, description) => {
          updated.push([id, description]);
          return Promise.resolve();
        },
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 0 });
      expect(updated).toEqual([[TASK_ID, 'Oat milk, not regular\n\nObsidian Task Sync ID: ^ots-a1']]);
      expect(links.get('ots-a1')?.lastSyncedDescription).toBe('Oat milk, not regular');
    });

    it('inserts a description pulled from the provider under the task line', async () => {
      const note = new FakeNote('- [ ] Buy milk ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDescription: '' },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Buy milk',
          description: 'Oat milk, not regular\n\nObsidian Task Sync ID: ^ots-a1',
        }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 1, conflicted: 0 });
      expect(note.content).toBe('- [ ] Buy milk ^ots-a1\n\tOat milk, not regular');
      expect(links.get('ots-a1')?.lastSyncedDescription).toBe('Oat milk, not regular');
    });

    it('replaces an existing description with a remote change', async () => {
      const note = new FakeNote('- [ ] Buy milk ^ots-a1\n\tOld notes');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDescription: 'Old notes' },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Buy milk',
          description: 'New notes\n\nObsidian Task Sync ID: ^ots-a1',
        }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 1 });
      expect(note.content).toBe('- [ ] Buy milk ^ots-a1\n\tNew notes');
    });

    it('is not a conflict when both sides changed the description to the same text', async () => {
      const note = new FakeNote('- [ ] Buy milk ^ots-a1\n\tSame notes');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDescription: 'Old notes' },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Buy milk',
          description: 'Same notes\n\nObsidian Task Sync ID: ^ots-a1',
        }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
      expect(note.content).toBe('- [ ] Buy milk ^ots-a1\n\tSame notes');
      expect(links.get('ots-a1')?.lastSyncedDescription).toBe('Same notes');
    });

    it('resolves a genuine description conflict in local\'s favor when the remote task carries no last-modified time', async () => {
      const note = new FakeNote('- [ ] Buy milk ^ots-a1\n\tLocal notes');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDescription: 'Old notes' },
      ]);
      const updated: Array<[string, string]> = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Buy milk',
          description: 'Remote notes\n\nObsidian Task Sync ID: ^ots-a1',
        }),
        updateTaskDescription: (id, description) => {
          updated.push([id, description]);
          return Promise.resolve();
        },
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 1 });
      expect(updated).toEqual([[TASK_ID, 'Local notes\n\nObsidian Task Sync ID: ^ots-a1']]);
    });

    it('sends the description on creation when the line already has one', async () => {
      const note = new FakeNote('- [ ] Buy milk\n\tOat milk, not regular');
      const links = new TaskLinkStore();
      const created: NewTask[] = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks(),
        listProjects: projectExists,
        createTask: (task) => {
          created.push(task);
          return Promise.resolve({ id: TASK_ID, title: task.title });
        },
      });

      await sync.run(PROJECT);
      const blockId = /\^(\S+)$/.exec(note.content.split('\n')[0])?.[1] ?? '';

      expect(created).toEqual([
        {
          title: 'Buy milk',
          projectId: PROJECT,
          description: `Oat milk, not regular\n\nObsidian Task Sync ID: ^${blockId}`,
          labels: [],
        },
      ]);
      expect(links.get(blockId)?.lastSyncedDescription).toBe('Oat milk, not regular');
    });
  });
});
