import { NewTask } from '../services/task-provider';
import { TaskProviderError } from '../services/task-provider-error';
import { OrphanTracker } from '../services/sync/orphan-tracker';
import { bareBlockIdDescription, orphanNoticeDescription } from '../services/sync/orphan-notice';
import { TaskLinkStore } from '../services/sync/task-links';
import { NoteEdits, SourceNote, TitleSync, applyLineEdits, applyNoteEdits, appendLines, removeLines } from '../services/sync/title-sync';
import { LooseProviderTask, stubProvider } from './support/stub-provider';

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

  async applyEdits(edits: NoteEdits): Promise<void> {
    this.saves += 1;
    this.content = applyNoteEdits(this.content, edits);
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

function remoteTasks(...tasks: LooseProviderTask[]) {
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

  describe('tags sync', () => {
    it('pushes a newly added tag', async () => {
      const note = new FakeNote('- [ ] Renew passport #errands ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Renew passport', lastSyncedTags: [] },
      ]);
      const updated: Array<[string, readonly string[]]> = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Renew passport' }),
        updateTaskLabels: (id, labels) => {
          updated.push([id, labels]);
          return Promise.resolve();
        },
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 0 });
      expect(updated).toEqual([[TASK_ID, ['errands']]]);
      expect(links.get('ots-a1')?.lastSyncedTags).toEqual(['errands']);
    });

    it('pulls a label added in the provider as a trailing tag', async () => {
      const note = new FakeNote('- [ ] Renew passport ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Renew passport', lastSyncedTags: [] },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Renew passport', labels: ['errands'] }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 1, conflicted: 0 });
      expect(note.content).toBe('- [ ] Renew passport #errands ^ots-a1');
      expect(links.get('ots-a1')?.lastSyncedTags).toEqual(['errands']);
    });

    it('is not a conflict when both sides have the same tags in a different order', async () => {
      const note = new FakeNote('- [ ] Renew passport #urgent #errands ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Renew passport', lastSyncedTags: [] },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Renew passport', labels: ['errands', 'urgent'] }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
      expect(note.content).toBe('- [ ] Renew passport #urgent #errands ^ots-a1');
    });

    it('resolves a genuine tag conflict in local\'s favor when the remote task carries no last-modified time', async () => {
      const note = new FakeNote('- [ ] Renew passport #local-only ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Renew passport', lastSyncedTags: ['errands'] },
      ]);
      const updated: Array<[string, readonly string[]]> = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Renew passport', labels: ['remote-only'] }),
        updateTaskLabels: (id, labels) => {
          updated.push([id, labels]);
          return Promise.resolve();
        },
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 1 });
      expect(updated).toEqual([[TASK_ID, ['local-only']]]);
    });

    it('sends tags on creation when the line already has them', async () => {
      const note = new FakeNote('- [ ] Renew passport #errands #urgent');
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
      const blockId = /\^(\S+)$/.exec(note.content)?.[1] ?? '';

      expect(created).toEqual([
        {
          title: 'Renew passport',
          projectId: PROJECT,
          description: `Obsidian Task Sync ID: ^${blockId}`,
          labels: ['errands', 'urgent'],
        },
      ]);
      expect(links.get(blockId)?.lastSyncedTags).toEqual(['errands', 'urgent']);
    });
  });

  describe('cross-field independence', () => {
    it('resolves a title conflict by recency while a simultaneous, unrelated tag change simply pushes', async () => {
      const note = new FakeNote('- [ ] Local title #new-tag ^ots-a1');
      note.modifiedAt = 1_000;
      const links = new TaskLinkStore([
        {
          blockId: 'ots-a1',
          providerTaskId: TASK_ID,
          lastSyncedTitle: 'Original title',
          lastSyncedTags: [],
        },
      ]);
      const pushedTitles: string[] = [];
      const pushedLabels: Array<readonly string[]> = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Remote title', updatedAt: 2_000 }),
        updateTaskTitle: (_id, title) => {
          pushedTitles.push(title);
          return Promise.resolve();
        },
        updateTaskLabels: (_id, labels) => {
          pushedLabels.push(labels);
          return Promise.resolve();
        },
      });

      const outcome = await sync.run(PROJECT);

      // The title conflict is the only conflict; the tag change is a plain, unrelated push.
      expect(outcome).toMatchObject({ conflicted: 1, pushed: 1, pulled: 1 });
      expect(note.content).toBe('- [ ] Remote title #new-tag ^ots-a1');
      expect(pushedTitles).toEqual([]);
      expect(pushedLabels).toEqual([['new-tag']]);
      expect(links.get('ots-a1')).toMatchObject({
        lastSyncedTitle: 'Remote title',
        lastSyncedTags: ['new-tag'],
      });
    });
  });

  it('removes the line when its linked task was deleted in the provider', async () => {
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve(undefined),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ removedLine: 1 });
    expect(note.content).toBe('');
    expect(links.get('ots-a1')).toBeUndefined();
  });

  it('leaves the line and the link alone when the missing task turns out to have moved to another project', async () => {
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk' }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ removedLine: 0, removedTask: 0 });
    expect(note.content).toBe('- [ ] Buy milk ^ots-a1');
    expect(links.get('ots-a1')).toEqual({
      blockId: 'ots-a1',
      providerTaskId: TASK_ID,
      lastSyncedTitle: 'Buy milk',
    });
  });

  it('checks the line off when its linked task turns out to have been completed remotely', async () => {
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: false },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: PROJECT, isCompleted: true }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ removedLine: 0, removedTask: 0, pulled: 1 });
    expect(note.content).toBe('- [x] Buy milk ^ots-a1');
    expect(links.get('ots-a1')?.lastSyncedDone).toBe(true);
  });

  it('does nothing more when a completed task is found and the line is already checked', async () => {
    const note = new FakeNote('- [x] Buy milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: false },
    ]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: PROJECT, isCompleted: true }),
    });

    expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
    expect(note.content).toBe('- [x] Buy milk ^ots-a1');
    expect(links.get('ots-a1')?.lastSyncedDone).toBe(true);
  });

  // A completed task found here is a known constant, not itself in question, so the local edit
  // always wins outright rather than by recency: there is no timestamp comparison to make when
  // only one side actually moved.
  it('reopens a completed task when the line was independently unchecked', async () => {
    const note = new FakeNote('- [ ] Buy milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastSyncedDone: true },
    ]);
    const reopened: string[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: PROJECT, isCompleted: true }),
      reopenTask: (id) => {
        reopened.push(id);
        return Promise.resolve();
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 0 });
    expect(reopened).toEqual([TASK_ID]);
    expect(links.get('ots-a1')?.lastSyncedDone).toBe(false);
  });

  it('recreates the task when it was deleted remotely but the line carries an edited title', async () => {
    const note = new FakeNote('- [ ] Buy oat milk ^ots-a1');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const created: NewTask[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      getTask: () => Promise.resolve(undefined),
      createTask: (task) => {
        created.push(task);
        return Promise.resolve({ id: 'new-task-id', title: task.title });
      },
    });

    expect(await sync.run(PROJECT)).toMatchObject({ conflicted: 1, recreatedTask: 1, removedLine: 0 });
    expect(created).toEqual([
      { title: 'Buy oat milk', projectId: PROJECT, description: 'Obsidian Task Sync ID: ^ots-a1', labels: [] },
    ]);
    expect(note.content).toBe('- [ ] Buy oat milk ^ots-a1');
    expect(links.get('ots-a1')).toEqual({
      blockId: 'ots-a1',
      providerTaskId: 'new-task-id',
      lastSyncedTitle: 'Buy oat milk',
      lastSyncedDescription: '',
      lastSyncedTags: [],
    });
  });

  it('does nothing the first time a linked line goes missing from the note', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn();
    const sync = makeSync(new FakeNote('# Nothing here'), links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      removeTask,
    });

    expect(await sync.run(PROJECT)).toMatchObject({ removedTask: 0 });
    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('ots-a1')).toBeDefined();
  });

  it('still does nothing 59 seconds after a linked line went missing', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn();
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(59_000);
    await sync.run(PROJECT);

    expect(removeTask).not.toHaveBeenCalled();
  });

  it('removes the linked task once a missing line has stayed missing for 60 seconds', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ removedTask: 1 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    expect(links.get('ots-a1')).toBeUndefined();
  });

  it('resurrects the line when the remote edit is newer than the note', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const note = new FakeNote('# Nothing here');
    note.modifiedAt = 1_000;
    const removeTask = jest.fn();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy oat milk', updatedAt: 2_000 }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ conflicted: 1, resurrectedLine: 1, removedTask: 0 });
    expect(removeTask).not.toHaveBeenCalled();
    expect(note.content).toBe('# Nothing here\n- [ ] Buy oat milk ^ots-a1');
    expect(links.get('ots-a1')?.lastSyncedTitle).toBe('Buy oat milk');
  });

  it('deletes the task instead of resurrecting the line when the note is at least as new as the remote edit', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const note = new FakeNote('# Nothing here');
    note.modifiedAt = 2_000;
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy oat milk', updatedAt: 2_000 }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ conflicted: 1, removedTask: 1, resurrectedLine: 0 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    expect(links.get('ots-a1')).toBeUndefined();
  });

  it('deletes the task when the remote edit carries no last-modified time to compare', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(new FakeNote('# Nothing here'), links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy oat milk' }),
      removeTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ conflicted: 1, removedTask: 1 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
  });

  it('drops the link without calling removeTask once a direct lookup confirms the task is genuinely gone too', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn();
    const getTask = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      removeTask,
      getTask,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    expect(getTask).toHaveBeenCalledWith(TASK_ID);
    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('ots-a1')).toBeUndefined();
  });

  it('leaves the link alone when a line-missing task turns out to have just moved to another project', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn();
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      removeTask,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: 'some-other-project' }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('ots-a1')).toBeDefined();
  });

  it('removes a task that turns out to have been completed once its line has already gone missing', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      removeTask,
      getTask: () => Promise.resolve({ id: TASK_ID, title: 'Buy milk', projectId: PROJECT, isCompleted: true }),
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ removedTask: 1 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    expect(links.get('ots-a1')).toBeUndefined();
  });

  it('stops tracking a missing line that reappears in the note before the grace period is up', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const note = new FakeNote('# Nothing here');
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      removeTask,
    });

    await sync.run(PROJECT);
    note.content = '- [ ] Buy milk ^ots-a1';
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('ots-a1')).toBeDefined();
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

  it('preserves the task\'s existing user-authored description when flagging it as an orphan', async () => {
    jest.useFakeTimers();
    const orphans = new OrphanTracker();
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Buy milk',
          embeddedBlockId: 'ots-orphan',
          description: bareBlockIdDescription('ots-orphan', 'Oat milk, not regular'),
        }),
        updateTaskDescription,
      },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60 * 60_000);
    await sync.run(PROJECT);

    const [, description] = updateTaskDescription.mock.calls[0] as [string, string];
    expect(description).toContain('Oat milk, not regular');
    expect(description.toLowerCase()).toContain('orphaned');
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

  it('un-flags an orphan that becomes properly linked before its removal date, reverting its description', async () => {
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 0);
    orphans.flag(TASK_ID, 999_999_999);
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote('- [ ] Buy milk ^ots-a1'),
      links,
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-a1' }),
        updateTaskDescription,
      },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledWith(TASK_ID, 'Obsidian Task Sync ID: ^ots-a1');
    expect(orphans.get(TASK_ID)).toBeUndefined();
  });

  it('restores the task\'s user-authored description when un-flagging it, not just the bare footer', async () => {
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 0);
    orphans.flag(TASK_ID, 999_999_999);
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote('- [ ] Buy milk ^ots-a1'),
      links,
      {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Buy milk',
          embeddedBlockId: 'ots-a1',
          description: orphanNoticeDescription('ots-a1', 999_999_999, 'Oat milk, not regular'),
        }),
        updateTaskDescription,
      },
      undefined,
      undefined,
      orphans,
    );

    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledWith(
      TASK_ID,
      bareBlockIdDescription('ots-a1', 'Oat milk, not regular'),
    );
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

describe('removeLines', () => {
  it('drops a line that still reads as expected', () => {
    const removals = [{ lineNumber: 1, expected: '- [ ] Second' }];

    expect(removeLines('- [ ] First\n- [ ] Second\n- [ ] Third', removals)).toBe('- [ ] First\n- [ ] Third');
  });

  it('leaves a line the user edited in the meantime untouched', () => {
    const removals = [{ lineNumber: 0, expected: '- [ ] Old' }];

    expect(removeLines('- [ ] Typed something else', removals)).toBe('- [ ] Typed something else');
  });

  it('drops several lines by index in one call', () => {
    const removals = [
      { lineNumber: 0, expected: '- [ ] First' },
      { lineNumber: 2, expected: '- [ ] Third' },
    ];

    expect(removeLines('- [ ] First\n- [ ] Second\n- [ ] Third', removals)).toBe('- [ ] Second');
  });

  it('leaves the note empty when its only line is removed', () => {
    const removals = [{ lineNumber: 0, expected: '- [ ] Only line' }];

    expect(removeLines('- [ ] Only line', removals)).toBe('');
  });
});

describe('appendLines', () => {
  it('adds a new line at the end of a non-empty note', () => {
    expect(appendLines('- [ ] First', ['- [ ] Second'])).toBe('- [ ] First\n- [ ] Second');
  });

  it('does not leave a leading blank line when the note started empty', () => {
    expect(appendLines('', ['- [ ] First'])).toBe('- [ ] First');
  });

  it('leaves the note untouched when there is nothing to append', () => {
    expect(appendLines('- [ ] First', [])).toBe('- [ ] First');
  });
});

describe('applyNoteEdits', () => {
  it('applies replacements, removals and appends together', () => {
    const edits: NoteEdits = {
      replacements: [{ lineNumber: 0, expected: '- [ ] First', replacement: '- [ ] First edited' }],
      removals: [{ lineNumber: 1, expected: '- [ ] Second' }],
      blocks: [],
      appended: ['- [ ] Third'],
    };

    expect(applyNoteEdits('- [ ] First\n- [ ] Second', edits)).toBe('- [ ] First edited\n- [ ] Third');
  });

  it('does nothing when every list is empty', () => {
    const edits: NoteEdits = { replacements: [], removals: [], blocks: [], appended: [] };

    expect(applyNoteEdits('- [ ] Only line', edits)).toBe('- [ ] Only line');
  });

  it('inserts a new block under a task line where none existed', () => {
    const edits: NoteEdits = {
      replacements: [],
      removals: [],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 0,
          replacementLines: ['\tOat milk'],
        },
      ],
      appended: [],
    };

    expect(applyNoteEdits('- [ ] Buy milk\n- [ ] Second', edits)).toBe(
      '- [ ] Buy milk\n\tOat milk\n- [ ] Second',
    );
  });

  it('replaces an existing block with a shorter one', () => {
    const edits: NoteEdits = {
      replacements: [],
      removals: [],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 2,
          replacementLines: ['\tJust one line now'],
        },
      ],
      appended: [],
    };

    expect(applyNoteEdits('- [ ] Buy milk\n\tOld line one\n\tOld line two\n- [ ] Second', edits)).toBe(
      '- [ ] Buy milk\n\tJust one line now\n- [ ] Second',
    );
  });

  it('replaces an existing block with a longer one', () => {
    const edits: NoteEdits = {
      replacements: [],
      removals: [],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 1,
          replacementLines: ['\tFirst', '\tSecond', '\tThird'],
        },
      ],
      appended: [],
    };

    expect(applyNoteEdits('- [ ] Buy milk\n\tOld line\n- [ ] Second', edits)).toBe(
      '- [ ] Buy milk\n\tFirst\n\tSecond\n\tThird\n- [ ] Second',
    );
  });

  it('skips a block edit whose anchor task line no longer matches, the same safety net every other edit kind gets', () => {
    const edits: NoteEdits = {
      replacements: [],
      removals: [],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 0,
          replacementLines: ['\tOat milk'],
        },
      ],
      appended: [],
    };

    expect(applyNoteEdits('- [ ] Typed something else', edits)).toBe('- [ ] Typed something else');
  });

  it('combines a block edit with an unrelated replacement and removal in the same commit without corruption', () => {
    const edits: NoteEdits = {
      replacements: [{ lineNumber: 0, expected: '- [ ] Buy milk', replacement: '- [ ] Buy oat milk' }],
      removals: [{ lineNumber: 2, expected: '- [ ] Third' }],
      blocks: [
        {
          taskLineNumber: 0,
          expectedTaskLine: '- [ ] Buy milk',
          startLine: 1,
          lineCount: 0,
          replacementLines: ['\tOat milk, not regular'],
        },
      ],
      appended: [],
    };

    expect(
      applyNoteEdits('- [ ] Buy milk\n- [ ] Second\n- [ ] Third', edits),
    ).toBe('- [ ] Buy oat milk\n\tOat milk, not regular\n- [ ] Second');
  });
});
