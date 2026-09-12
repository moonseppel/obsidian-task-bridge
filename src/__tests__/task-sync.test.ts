import { TaskLinkStore } from '../services/sync/task-links';
import { TaskSync } from '../services/sync/task-sync';
import { NewTask } from '../services/task-provider';
import {
  FakeNote,
  PROJECT,
  TASK_ID,
  makeSync,
  projectExists,
  remoteTasks,
} from './support/sync-harness';

describe('TaskSync creation and title sync', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a Todoist task for a line that has no anchor yet', async () => {
    const note = new FakeNote('- [ ] Buy milk');
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

    expect(await sync.run(PROJECT)).toMatchObject({ created: 1, pushed: 0, pulled: 0 });
    expect(note.content).toMatch(/^- \[ \] Buy milk \^ots-[a-z0-9]{8}$/);
    const blockId = /\^(\S+)$/.exec(note.content)?.[1] ?? '';
    expect(created).toEqual([
      { title: 'Buy milk', projectId: PROJECT, description: `Obsidian Task Sync ID: ^${blockId}`, labels: [] },
    ]);
  });

  it('bakes the device tag into a freshly minted block id', async () => {
    const note = new FakeNote('- [ ] Buy milk');
    const sync = makeSync(
      note,
      new TaskLinkStore(),
      {
        listTasks: remoteTasks(),
        listProjects: projectExists,
        createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
      },
      () => undefined,
      () => 'dev1a',
    );

    await sync.run(PROJECT);

    expect(note.content).toMatch(/^- \[ \] Buy milk \^ots-[a-z0-9]{8}-dev1a$/);
  });

  it('records the new task against the block id it wrote into the note', async () => {
    const note = new FakeNote('- [ ] Buy milk');
    const links = new TaskLinkStore();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
    });

    await sync.run(PROJECT);
    const blockId = /\^(\S+)$/.exec(note.content)?.[1] ?? '';

    expect(links.get(blockId)).toEqual({
      blockId,
      providerTaskId: TASK_ID,
      lastSyncedTitle: 'Buy milk',
      lastSyncedDescription: '',
      lastSyncedTags: [],
    });
  });

  it('creates a task for a checked line too, since titles sync regardless of state', async () => {
    const note = new FakeNote('- [x] Call the dentist');
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
    });

    expect((await sync.run(PROJECT)).created).toBe(1);
    expect(note.content).toContain('- [x] Call the dentist ^ots-');
  });

  function pushScenario(): {
    note: FakeNote;
    links: TaskLinkStore;
    pushed: Array<[string, string]>;
    sync: TaskSync;
  } {
    const note = new FakeNote('- [ ] Buy oat milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const pushed: Array<[string, string]> = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      updateTaskTitle: (taskId, title) => {
        pushed.push([taskId, title]);
        return Promise.resolve();
      },
    });

    return { note, links, pushed, sync };
  }

  it('sends a title changed in Obsidian to the provider', async () => {
    const { pushed, sync } = pushScenario();

    await sync.run(PROJECT);

    expect(pushed).toEqual([[TASK_ID, 'Buy oat milk']]);
  });

  it('counts a title changed in Obsidian as pushed', async () => {
    const { sync } = pushScenario();

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 1, pulled: 0 });
  });

  it('records the pushed title as the one both sides now agree on', async () => {
    const { links, sync } = pushScenario();

    await sync.run(PROJECT);

    expect(links.get('ots-a1')?.lastSyncedTitle).toBe('Buy oat milk');
  });

  it('leaves the pushed line exactly as the user typed it', async () => {
    const { note, sync } = pushScenario();

    await sync.run(PROJECT);

    expect(note.content).toBe('- [ ] Buy oat milk ^ots-a1');
  });

  it('pulls a title the user changed in Todoist', async () => {
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy oat milk' }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 0, pulled: 1 });
    expect(note.content).toBe('- [ ] Buy oat milk ^ots-a1');
    expect(links.get('ots-a1')?.lastSyncedTitle).toBe('Buy oat milk');
  });

  it('lets the Obsidian edit win when both sides changed to different titles, and counts the conflict', async () => {
    const note = new FakeNote('- [ ] Local wins ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Original' },
    ]);
    const pushed: string[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Remote wins' }),
      updateTaskTitle: (_id, title) => {
        pushed.push(title);
        return Promise.resolve();
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 1, pulled: 0, conflicted: 1 });
    expect(pushed).toEqual(['Local wins']);
    expect(note.content).toBe('- [ ] Local wins ^ots-a1');
  });

  it('pulls the remote title when it is the newer of two conflicting edits', async () => {
    const note = new FakeNote('- [ ] Local wins ^ots-a1');
    note.modifiedAt = 1_000;
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Original' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Remote wins', updatedAt: 2_000 }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 0, pulled: 1, conflicted: 1 });
    expect(note.content).toBe('- [ ] Remote wins ^ots-a1');
    expect(links.get('ots-a1')?.lastSyncedTitle).toBe('Remote wins');
  });

  it('pushes the local title when it is the newer of two conflicting edits', async () => {
    const note = new FakeNote('- [ ] Local wins ^ots-a1');
    note.modifiedAt = 2_000;
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Original' },
    ]);
    const pushed: string[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Remote wins', updatedAt: 1_000 }),
      updateTaskTitle: (_id, title) => {
        pushed.push(title);
        return Promise.resolve();
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 1, pulled: 0, conflicted: 1 });
    expect(pushed).toEqual(['Local wins']);
    expect(note.content).toBe('- [ ] Local wins ^ots-a1');
  });

  it('falls back to local-wins when the remote task carries no last-modified time', async () => {
    const note = new FakeNote('- [ ] Local wins ^ots-a1');
    note.modifiedAt = 1_000;
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Original' },
    ]);
    const pushed: string[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Remote wins' }),
      updateTaskTitle: (_id, title) => {
        pushed.push(title);
        return Promise.resolve();
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 1, pulled: 0, conflicted: 1 });
    expect(pushed).toEqual(['Local wins']);
  });

  it('falls back to local-wins, deterministically, when both sides were modified at the exact same time', async () => {
    const scenario = (): {
      note: FakeNote;
      links: TaskLinkStore;
      pushed: string[];
      sync: TaskSync;
    } => {
      const note = new FakeNote('- [ ] Local wins ^ots-a1');
      note.modifiedAt = 1_000;
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Original' },
      ]);
      const pushed: string[] = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Remote wins', updatedAt: 1_000 }),
        updateTaskTitle: (_id, title) => {
          pushed.push(title);
          return Promise.resolve();
        },
      });

      return { note, links, pushed, sync };
    };

    const first = scenario();
    const second = scenario();

    expect(await first.sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 1 });
    expect(await second.sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 1 });
    expect(first.pushed).toEqual(['Local wins']);
    expect(second.pushed).toEqual(['Local wins']);
  });

  it('is not a conflict when both sides changed to the same title', async () => {
    const note = new FakeNote('- [ ] Same title ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Original' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Same title' }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 0, pulled: 0, conflicted: 0 });
    expect(note.content).toBe('- [ ] Same title ^ots-a1');
    expect(links.get('ots-a1')?.lastSyncedTitle).toBe('Same title');
  });

  it('does nothing at all when both sides already agree', async () => {
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 0, pulled: 0 });
    expect(note.saves).toBe(0);
  });
});
