import { TaskLinkStore } from '../services/sync/task-links';
import { NewTask } from '../services/task-provider';
import {
  FakeNote,
  bareBlockIdDescription,
  PROJECT,
  TASK_ID,
  makeSync,
  projectExists,
  remoteTasks,
} from './support/sync-harness';

describe('TaskSync tag sync', () => {
  afterEach(() => {
    jest.useRealTimers();
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

    it('resolves a tag conflict in local\'s favor when the remote task has no last-modified time', async () => {
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
          description: `TaskBridge ID: ^${blockId}`,
          labels: ['errands', 'urgent'],
        },
      ]);
      expect(links.get(blockId)?.lastSyncedTags).toEqual(['errands', 'urgent']);
    });

    it('leaves a label that cannot be written as a tag unsynced, rather than mangling it into the note', async () => {
      const note = new FakeNote('- [ ] Renew passport ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Renew passport', lastSyncedTags: [] },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Renew passport', labels: ['with space'] }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
      expect(note.content).toBe('- [ ] Renew passport ^ots-a1');
      expect(links.get('ots-a1')?.lastSyncedTags).toEqual([]);
    });

    it('preserves a label that cannot be written as a tag when pushing a local tag change', async () => {
      const note = new FakeNote('- [ ] Renew passport #errands ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Renew passport', lastSyncedTags: [] },
      ]);
      const updated: Array<[string, readonly string[]]> = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Renew passport', labels: ['with space'] }),
        updateTaskLabels: (id, labels) => {
          updated.push([id, labels]);
          return Promise.resolve();
        },
      });

      await sync.run(PROJECT);

      expect(updated).toEqual([[TASK_ID, ['errands', 'with space']]]);
    });

    it('does not keep pushing when the note types the same tag twice but Todoist reports it once', async () => {
      const note = new FakeNote('- [ ] Renew passport #errands #errands ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Renew passport', lastSyncedTags: ['errands'] },
      ]);
      const updateTaskLabels = jest.fn();
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Renew passport', labels: ['errands'] }),
        updateTaskLabels,
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
      expect(updateTaskLabels).not.toHaveBeenCalled();
    });
  });

  describe('a tag standing inside the text', () => {
    it('pushes it as a label and the text without it as the title, leaving the line alone', async () => {
      const note = new FakeNote('- [ ] Call the #home dentist ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Call the dentist', lastSyncedTags: [] },
      ]);
      const updated: Array<[string, readonly string[]]> = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Call the dentist' }),
        updateTaskLabels: (id, labels) => {
          updated.push([id, labels]);
          return Promise.resolve();
        },
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 1, pulled: 0, conflicted: 0 });
      expect(updated).toEqual([[TASK_ID, ['home']]]);
      expect(note.content).toBe('- [ ] Call the #home dentist ^ots-a1');
    });

    it('leaves the tag exactly where it stands when neither side changed', async () => {
      const note = new FakeNote('- [ ] #home Call the #urgent dentist ^ots-a1');
      const links = new TaskLinkStore([
        {
          blockId: 'ots-a1',
          providerTaskId: TASK_ID,
          lastSyncedTitle: 'Call the dentist',
          lastSyncedTags: ['home', 'urgent'],
        },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Call the dentist', labels: ['urgent', 'home'] }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
      expect(note.content).toBe('- [ ] #home Call the #urgent dentist ^ots-a1');
    });

    it('never makes a label out of a #tag standing in description text', async () => {
      const note = new FakeNote('- [ ] Call the dentist ^ots-a1\n\tAsk about #insurance');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Call the dentist', lastSyncedTags: [] },
      ]);
      const descriptions: string[] = [];
      const updateTaskLabels = jest.fn();
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Call the dentist' }),
        updateTaskLabels,
        updateTaskDescription: (_id, description) => {
          descriptions.push(description);
          return Promise.resolve();
        },
      });

      await sync.run(PROJECT);

      expect(updateTaskLabels).not.toHaveBeenCalled();
      expect(descriptions).toEqual([bareBlockIdDescription('ots-a1', 'Ask about #insurance')]);
      expect(note.content).toBe('- [ ] Call the dentist ^ots-a1\n\tAsk about #insurance');
    });

    it('pushes title and labels once for a link whose last agreed title still carries the tag text', async () => {
      const note = new FakeNote('- [ ] Call the #home dentist ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Call the #home dentist', lastSyncedTags: [] },
      ]);
      const titles: string[] = [];
      const labels: Array<readonly string[]> = [];
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Call the #home dentist' }),
        updateTaskTitle: (_id, title) => {
          titles.push(title);
          return Promise.resolve();
        },
        updateTaskLabels: (_id, pushed) => {
          labels.push(pushed);
          return Promise.resolve();
        },
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 2, pulled: 0, conflicted: 0 });
      expect(titles).toEqual(['Call the dentist']);
      expect(labels).toEqual([['home']]);
      expect(note.content).toBe('- [ ] Call the #home dentist ^ots-a1');

      // The second pass finds both sides agreed and writes nothing more.
      const settled = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Call the dentist', labels: ['home'] }),
      });

      expect(await settled.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 0, conflicted: 0 });
      expect(note.content).toBe('- [ ] Call the #home dentist ^ots-a1');
    });
  });

  describe('a link made before a tag could stand inside the text', () => {
    it('lets a newer remote title win the conflict its one-time push would otherwise have been', async () => {
      const note = new FakeNote('- [ ] Call the #home dentist ^ots-a1');
      note.modifiedAt = 1_000;
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Call the #home dentist', lastSyncedTags: [] },
      ]);
      const updateTaskTitle = jest.fn();
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Book a check-up', updatedAt: 2_000 }),
        updateTaskTitle,
        updateTaskLabels: () => Promise.resolve(),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ conflicted: 1, pulled: 1 });
      expect(updateTaskTitle).not.toHaveBeenCalled();
      expect(note.content).toBe('- [ ] Book a check-up #home ^ots-a1');
    });
  });

  describe('pulling a change onto a line whose tag stands inside its text', () => {
    it('takes a removed label out where it stands, leaving the rest of the text alone', async () => {
      const note = new FakeNote('- [ ] Call the #home dentist ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Call the dentist', lastSyncedTags: ['home'] },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Call the dentist', labels: [] }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 1, conflicted: 0 });
      expect(note.content).toBe('- [ ] Call the dentist ^ots-a1');
    });

    it('appends an added label while leaving the one already standing inside the text in place', async () => {
      const note = new FakeNote('- [ ] Call the #home dentist ^ots-a1');
      const links = new TaskLinkStore([
        { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Call the dentist', lastSyncedTags: ['home'] },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Call the dentist', labels: ['home', 'urgent'] }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 1, conflicted: 0 });
      expect(note.content).toBe('- [ ] Call the #home dentist #urgent ^ots-a1');
    });

    it('re-renders the line as the pulled title with its tags trailing it', async () => {
      const note = new FakeNote('- [ ] Call the #home dentist #urgent ^ots-a1');
      note.modifiedAt = 1_000;
      const links = new TaskLinkStore([
        {
          blockId: 'ots-a1',
          providerTaskId: TASK_ID,
          lastSyncedTitle: 'Call the dentist',
          lastSyncedTags: ['home', 'urgent'],
        },
      ]);
      const sync = makeSync(note, links, {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Book a check-up',
          labels: ['home', 'urgent'],
          updatedAt: 2_000,
        }),
      });

      expect(await sync.run(PROJECT)).toMatchObject({ pushed: 0, pulled: 1, conflicted: 0 });
      expect(note.content).toBe('- [ ] Book a check-up #home #urgent ^ots-a1');
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
});
