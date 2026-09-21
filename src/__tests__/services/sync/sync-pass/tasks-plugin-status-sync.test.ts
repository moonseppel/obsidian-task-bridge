import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { TaskSync } from '../../../../services/sync/sync-pass/task-sync';
import { DEFAULT_TASKS_STATUSES } from '../../../../services/tasks-plugin/tasks-statuses';
import { TodoistStateMapping } from '../../../../services/todoist/todoist-state-mapping';
import { StubProviderOptions } from '../../../support/stub-provider';
import { FakeNote, PROJECT, TASK_ID, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

interface Scenario {
  readonly note: FakeNote;
  readonly links: TaskLinkStore;
  readonly calls: string[];
  readonly sync: TaskSync;
}

/** One linked line, its task in the provider as the pushes leave it, and the Tasks plugin enabled with a mapping. */
function scenario(line: string, lastSyncedDone: boolean, remoteDone: boolean, mapping = {}): Scenario {
  const note = new FakeNote(line);
  const links = new TaskLinkStore([
    { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone },
  ]);
  const calls: string[] = [];
  const remote = { id: TASK_ID, title: 'Buy milk', isCompleted: remoteDone, projectId: PROJECT };
  const provider: StubProviderOptions = {
    listTasks: async () => [remote],
    completeTask: async () => {
      calls.push('complete');
      remote.isCompleted = true;
    },
    reopenTask: async () => {
      calls.push('reopen');
      remote.isCompleted = false;
    },
  };

  return { note, links, calls, sync: makeSync(note, links, provider, tasksPluginMapping(mapping)) };
}

function tasksPluginMapping(stored: Record<string, string>): Parameters<typeof makeSync>[3] {
  const stateMapping = new TodoistStateMapping(() => Promise.resolve());
  stateMapping.restore(stored);

  return { readTasksPlugin: () => Promise.resolve({ statuses: DEFAULT_TASKS_STATUSES }), stateMapping };
}

describe('TaskSync with Tasks plugin statuses', () => {
  describe('without the Tasks plugin', () => {
    it('pushes [/] as completed', async () => {
      const note = new FakeNote('- [/] Buy milk ^tb-a1');
      const links = new TaskLinkStore([{ blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' }]);
      const calls: string[] = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
        completeTask: async () => {
          calls.push('complete');
        },
      });

      await sync.run(PROJECT);

      expect(calls).toEqual(['complete']);
    });

    it('writes a completion pulled from the provider as [x]', async () => {
      const note = new FakeNote('- [ ] Buy milk ^tb-a1');
      const links = new TaskLinkStore([{ blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' }]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', isCompleted: true }),
      });

      await sync.run(PROJECT);

      expect(note.content).toBe('- [x] Buy milk ^tb-a1');
    });
  });

  describe('with the default mapping', () => {
    it('leaves [/] alone when the task is completed in the provider', async () => {
      const { note, sync } = scenario('- [/] Buy milk ^tb-a1', false, true);

      await sync.run(PROJECT);

      expect(note.content).toBe('- [/] Buy milk ^tb-a1');
    });

    it('pushes [-] as completed', async () => {
      const { calls, sync } = scenario('- [-] Buy milk ^tb-a1', false, false);

      await sync.run(PROJECT);

      expect(calls).toEqual(['complete']);
    });

    it('pushes [X], a character the Tasks plugin does not define, as completed', async () => {
      const { calls, sync } = scenario('- [X] Buy milk ^tb-a1', false, false);

      await sync.run(PROJECT);

      expect(calls).toEqual(['complete']);
    });

    it('turns [x] into [ ] when the task is reopened in the provider', async () => {
      const { note, sync } = scenario('- [x] Buy milk ^tb-a1', true, false);

      await sync.run(PROJECT);

      expect(note.content).toBe('- [ ] Buy milk ^tb-a1');
    });
  });

  describe('with [/] mapped to open', () => {
    const inProgressOpen = { '/': 'open' };

    it('pushes [/] as open', async () => {
      const { calls, sync } = scenario('- [/] Buy milk ^tb-a1', true, true, inProgressOpen);

      await sync.run(PROJECT);

      expect(calls).toEqual(['reopen']);
    });

    it('pushes nothing when [ ] becomes [/]', async () => {
      const { calls, sync } = scenario('- [/] Buy milk ^tb-a1', false, false, inProgressOpen);

      await sync.run(PROJECT);

      expect(calls).toEqual([]);
    });

    it('leaves [/] alone when the task is reopened in the provider', async () => {
      const { note, sync } = scenario('- [/] Buy milk ^tb-a1', true, false, inProgressOpen);

      await sync.run(PROJECT);

      expect(note.content).toBe('- [/] Buy milk ^tb-a1');
    });

    it('writes [x] when the task is completed in the provider', async () => {
      const { note, sync } = scenario('- [/] Buy milk ^tb-a1', false, true, inProgressOpen);

      await sync.run(PROJECT);

      expect(note.content).toBe('- [x] Buy milk ^tb-a1');
    });

    it('reopens a task synced as completed from [/] before only once', async () => {
      const { calls, sync } = scenario('- [/] Buy milk ^tb-a1', true, true, inProgressOpen);
      await sync.run(PROJECT);

      await sync.run(PROJECT);

      expect(calls).toEqual(['reopen']);
    });

    it('does not complete a new [/] task after creating it', async () => {
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
        tasksPluginMapping(inProgressOpen),
      );

      await sync.run(PROJECT);

      expect(calls).toEqual([]);
    });

    it('settles, keeping [/], when [x] became [/] while the task was reopened in the provider', async () => {
      const { note, calls, sync } = scenario('- [/] Buy milk ^tb-a1', true, false, inProgressOpen);

      await sync.run(PROJECT);

      expect([note.content, calls]).toEqual(['- [/] Buy milk ^tb-a1', []]);
    });
  });

  it('writes a completion as [/] once [x] is mapped to open', async () => {
    const { note, sync } = scenario('- [ ] Buy milk ^tb-a1', false, true, { x: 'open' });

    await sync.run(PROJECT);

    expect(note.content).toBe('- [/] Buy milk ^tb-a1');
  });

  describe('with no status mapped to completed', () => {
    const nothingCompleted = { x: 'open', '/': 'open', '-': 'open' };

    it('leaves the line as it is when the task is completed in the provider', async () => {
      const { note, sync } = scenario('- [ ] Buy milk ^tb-a1', false, true, nothingCompleted);

      await sync.run(PROJECT);

      expect(note.content).toBe('- [ ] Buy milk ^tb-a1');
    });

    it('leaves the link as it is when the task is completed in the provider', async () => {
      const { links, sync } = scenario('- [ ] Buy milk ^tb-a1', false, true, nothingCompleted);

      await sync.run(PROJECT);

      expect(links.get('tb-a1')?.lastSyncedDone).toBe(false);
    });
  });
});
