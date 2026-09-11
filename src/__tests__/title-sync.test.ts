import { NewTask, ProviderTask } from '../services/task-provider';
import { TaskProviderError } from '../services/task-provider-error';
import { OrphanTracker } from '../services/sync/orphan-tracker';
import { TaskLinkStore } from '../services/sync/task-links';
import { LineEdit, SourceNote, TitleSync, applyLineEdits } from '../services/sync/title-sync';
import { stubProvider } from './support/stub-provider';

const PROJECT = 'project-1';
const TASK_ID = '6X4Vw2Hfmg73Q2XR';

class FakeNote implements SourceNote {
  content: string;
  saves = 0;
  modifiedAt = 0;

  constructor(content: string) {
    this.content = content;
  }

  async read(): Promise<string> {
    return this.content;
  }

  async lastModified(): Promise<number> {
    return this.modifiedAt;
  }

  async applyEdits(edits: readonly LineEdit[]): Promise<void> {
    this.saves += 1;
    this.content = applyLineEdits(this.content, edits);
  }
}

function makeSync(
  note: FakeNote,
  links: TaskLinkStore,
  provider: Parameters<typeof stubProvider>[0],
  onSave: () => void = () => undefined,
  getDeviceTag?: () => string,
  orphans?: OrphanTracker,
): TitleSync {
  return new TitleSync(
    note,
    stubProvider(provider),
    links,
    async () => {
      onSave();
    },
    getDeviceTag,
    orphans,
  );
}

function remoteTasks(...tasks: ProviderTask[]) {
  return () => Promise.resolve(tasks);
}

const INBOX = { id: 'inbox-1', name: 'Inbox', isDefault: true };
const ERRANDS = { id: PROJECT, name: 'Errands', isDefault: false };
const projectExists = () => Promise.resolve([INBOX, ERRANDS]);

describe('TitleSync', () => {
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
    expect(created).toEqual([{ title: 'Buy milk', projectId: PROJECT, description: `^${blockId}` }]);
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
    sync: TitleSync;
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
      sync: TitleSync;
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

  it('leaves a line alone when its task is missing from Todoist', async () => {
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(note, links, { listTasks: remoteTasks(), listProjects: projectExists });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 0, pulled: 0 });
    expect(note.content).toBe('- [ ] Buy milk ^ots-a1');
  });

  it('reuses an orphaned block id rather than adding a second anchor to the line', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^ots-orphan');
    const links = new TaskLinkStore();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect((await sync.run(PROJECT)).created).toBe(1);
    expect(note.content).toBe('- [ ] Buy milk ^ots-orphan');
    expect(links.get('ots-orphan')?.providerTaskId).toBe(TASK_ID);
  });

  it('re-links to a task already anchored with this block id instead of creating a duplicate', async () => {
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore();
    const createTask = jest.fn();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-a1' }),
      createTask,
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 0, pulled: 0 });
    expect(createTask).not.toHaveBeenCalled();
    expect(links.get('ots-a1')).toEqual({
      blockId: 'ots-a1',
      providerTaskId: TASK_ID,
      lastSyncedTitle: 'Buy milk',
    });
  });

  it('creates a task as usual when no already-anchored task matches the block id', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'other-task', title: 'Unrelated', embeddedBlockId: 'ots-other' }),
      createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect((await sync.run(PROJECT)).created).toBe(1);
    expect(links.get('ots-a1')?.providerTaskId).toBe(TASK_ID);
  });

  it('does not create a task the first time an unmatched block id is seen', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
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
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
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
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
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
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
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

    note.content = '- [ ] Buy milk ^ots-a1';
    expect((await sync.run(PROJECT)).created).toBe(0);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('never mints a block id that another line already carries', async () => {
    const note = new FakeNote('- [ ] First ^ots-taken\n- [ ] Second');
    const links = new TaskLinkStore([
      { blockId: 'ots-taken', providerTaskId: 'other', lastSyncedTitle: 'First' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: 'other', title: 'First' }),
      createTask: (task) => Promise.resolve({ id: TASK_ID, title: task.title }),
    });

    await sync.run(PROJECT);

    expect(note.content.split('\n')[1]).not.toContain('ots-taken');
  });

  it('skips lines that are not tasks and tasks with no title', async () => {
    const note = new FakeNote('# Heading\n- Plain bullet\n- [ ]  \nProse');
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
    });

    expect(await sync.run(PROJECT)).toMatchObject({ created: 0, pushed: 0, pulled: 0 });
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
      () => {
        saved += 1;
      },
    );

    await expect(sync.run(PROJECT)).rejects.toThrow();
    expect(saved).toBe(1);
  });

  it('tracks a task that carries this plugin\'s block id but has no live link to it', async () => {
    const orphans = new OrphanTracker();
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-orphan' }) },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);

    expect(orphans.get(TASK_ID)).toBeDefined();
  });

  it('never tracks a task whose link legitimately exists', async () => {
    const orphans = new OrphanTracker();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(
      new FakeNote('- [ ] Buy milk ^ots-a1'),
      links,
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-a1' }) },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);

    expect(orphans.get(TASK_ID)).toBeUndefined();
  });

  it('drops tracking for a task that is no longer orphaned after being re-linked', async () => {
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 1_000);
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(
      new FakeNote('- [ ] Buy milk ^ots-a1'),
      links,
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-a1' }) },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);

    expect(orphans.get(TASK_ID)).toBeUndefined();
  });

  it('does not flag an orphan before it has been orphaned for 60 minutes', async () => {
    jest.useFakeTimers();
    const orphans = new OrphanTracker();
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-orphan' }),
        updateTaskDescription,
      },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(59 * 60_000);
    await sync.run(PROJECT);

    expect(updateTaskDescription).not.toHaveBeenCalled();
    expect(orphans.get(TASK_ID)?.removalDueAt).toBeUndefined();
  });

  it('flags an orphan once it has been orphaned for 60 minutes, recording a removal date', async () => {
    jest.useFakeTimers();
    const orphans = new OrphanTracker();
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-orphan' }),
        updateTaskDescription,
      },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60 * 60_000);
    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledTimes(1);
    const [calledTaskId, description] = updateTaskDescription.mock.calls[0] as [string, string];
    expect(calledTaskId).toBe(TASK_ID);
    expect(description).toContain('^ots-orphan');
    expect(description.toLowerCase()).toContain('orphaned');
    expect(description.toLowerCase()).toContain('removed');

    expect(orphans.get(TASK_ID)?.removalDueAt).toBe(Date.now() + 2 * 24 * 60 * 60_000);
  });

  it('does nothing when a flagged orphan\'s removal date is still in the future', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 0);
    orphans.flag(TASK_ID, 20_000);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-orphan' }),
        removeTask,
      },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);

    expect(removeTask).not.toHaveBeenCalled();
    expect(orphans.get(TASK_ID)).toBeDefined();
  });

  it('removes a flagged orphan once its removal date has passed, and clears its tracking', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(20_000);
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 0);
    orphans.flag(TASK_ID, 20_000);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-orphan' }),
        removeTask,
      },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);

    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    expect(orphans.get(TASK_ID)).toBeUndefined();
  });
});

describe('applyLineEdits', () => {
  it('replaces a line that still reads as expected', () => {
    const edits = [{ lineNumber: 1, expected: '- [ ] Second', replacement: '- [ ] Changed' }];

    expect(applyLineEdits('- [ ] First\n- [ ] Second', edits)).toBe('- [ ] First\n- [ ] Changed');
  });

  it('leaves a line the user edited in the meantime untouched', () => {
    const edits = [{ lineNumber: 0, expected: '- [ ] Old', replacement: '- [ ] New' }];

    expect(applyLineEdits('- [ ] Typed something else', edits)).toBe('- [ ] Typed something else');
  });

  it('ignores an edit pointing past the end of the note', () => {
    const edits = [{ lineNumber: 9, expected: '- [ ] Gone', replacement: '- [ ] New' }];

    expect(applyLineEdits('- [ ] Only line', edits)).toBe('- [ ] Only line');
  });
});
