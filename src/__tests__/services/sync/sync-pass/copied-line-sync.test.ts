import { NewTask } from '../../../../services/task-provider';
import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import {
  FakeNote,
  PROJECT,
  TASK_ID,
  makeMultiFileSync,
  projectExists,
  remoteTasks,
} from '../../../support/sync-harness';
import { LooseProviderTask } from '../../../support/stub-provider';

const GRACE_MS = 60_000;
const FRESH_ANCHOR = /\^tb-[a-z0-9]{8}$/;

/** A link and its one remote task, as they stand before the line was ever copied. */
function linkedTo(path: string): TaskLinkStore {
  return new TaskLinkStore([
    { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastKnownFilePath: path },
  ]);
}

import { Logger } from '../../../../utils/logger';

describe('TaskSync with a task line copied to a second place', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'info').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('pushes the keeper line once and never lets the copy push the stale title back', async () => {
    const keeper = new FakeNote('- [ ] Bar ^tb-a1');
    const copy = new FakeNote('- [ ] Foo ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Foo', lastKnownFilePath: 'Keeper.md' },
    ]);
    let remoteTitle = 'Foo';
    const updateTaskTitle = jest.fn(async (_taskId: string, title: string) => {
      remoteTitle = title;
    });
    const sync = makeMultiFileSync(
      new Map([
        ['Copy.md', copy],
        ['Keeper.md', keeper],
      ]),
      links,
      { listTasks: () => Promise.resolve([{ id: TASK_ID, title: remoteTitle }]), updateTaskTitle },
    );

    await sync.run(PROJECT);
    await sync.run(PROJECT);

    expect(updateTaskTitle.mock.calls).toEqual([[TASK_ID, 'Bar']]);

    await sync.run(PROJECT);

    expect(updateTaskTitle).toHaveBeenCalledTimes(1);
    expect(keeper.content).toBe('- [ ] Bar ^tb-a1');
    expect(copy.content).toBe('- [ ] Foo ^tb-a1');
  });

  it('leaves the last known file on the keeper rather than flipping it to the copy', async () => {
    const keeper = new FakeNote('- [ ] Buy milk ^tb-a1');
    const copy = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk', lastKnownFilePath: 'Keeper.md' },
    ]);
    const sync = makeMultiFileSync(
      new Map([
        ['Copy.md', copy],
        ['Keeper.md', keeper],
      ]),
      links,
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }) },
    );

    await sync.run(PROJECT);
    await sync.run(PROJECT);
    await sync.run(PROJECT);

    expect(links.get('tb-a1')?.lastKnownFilePath).toBe('Keeper.md');
  });

  it('syncs only the first of two lines carrying the same id in one note', async () => {
    const note = new FakeNote('- [ ] Buy milk ^tb-a1\n- [ ] Buy oat milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Groceries' },
    ]);
    const updateTaskTitle = jest.fn(async () => undefined);
    const sync = makeMultiFileSync(new Map([['Tasks.md', note]]), links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Groceries' }),
      updateTaskTitle,
    });

    await sync.run(PROJECT);

    expect(updateTaskTitle).toHaveBeenCalledTimes(1);
    expect(updateTaskTitle).toHaveBeenCalledWith(TASK_ID, 'Buy milk');
    expect(note.content).toBe('- [ ] Buy milk ^tb-a1\n- [ ] Buy oat milk ^tb-a1');
  });

  it('does not count a line the tag filter excludes as carrying the id at all', async () => {
    jest.useFakeTimers();
    const inScope = new FakeNote('- [ ] Buy milk #work ^tb-a1');
    const outOfScope = new FakeNote('- [ ] Buy milk ^tb-a1');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Groceries', lastKnownFilePath: 'Work.md' },
    ]);
    const updateTaskTitle = jest.fn(async () => undefined);
    const sync = makeMultiFileSync(
      new Map([
        ['Personal.md', outOfScope],
        ['Work.md', inScope],
      ]),
      links,
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Groceries' }),
        listProjects: projectExists,
        updateTaskTitle,
        updateTaskLabels: async () => undefined,
      },
      { isTagInScope: (task) => task.tags.includes('work') },
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(GRACE_MS + 1);
    await sync.run(PROJECT);

    expect(updateTaskTitle).toHaveBeenCalledWith(TASK_ID, 'Buy milk');
    expect(outOfScope.content).toBe('- [ ] Buy milk ^tb-a1');
  });
});

describe('TaskSync re-minting a copied task line', () => {
  beforeEach(() => { jest.spyOn(Logger.prototype, 'info').mockImplementation(); });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('leaves both notes untouched while the duplicate is still inside the grace period', async () => {
    jest.useFakeTimers();
    const keeper = new FakeNote('- [ ] Buy milk ^tb-a1');
    const copy = new FakeNote('- [ ] Buy milk ^tb-a1');
    const createTask = jest.fn();
    const sync = makeMultiFileSync(
      new Map([
        ['Keeper.md', keeper],
        ['Copy.md', copy],
      ]),
      linkedTo('Keeper.md'),
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }), listProjects: projectExists, createTask },
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(GRACE_MS - 1);

    expect(await sync.run(PROJECT)).toMatchObject({ remintedCopies: 0 });
    expect(keeper.content).toBe('- [ ] Buy milk ^tb-a1');
    expect(copy.content).toBe('- [ ] Buy milk ^tb-a1');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('gives the copy an id of its own past the grace period, then a task of its own', async () => {
    jest.useFakeTimers();
    const keeper = new FakeNote('- [ ] Buy milk ^tb-a1');
    const copy = new FakeNote('- [ ] Buy milk ^tb-a1');
    const created: NewTask[] = [];
    const sync = makeMultiFileSync(
      new Map([
        ['Keeper.md', keeper],
        ['Copy.md', copy],
      ]),
      linkedTo('Keeper.md'),
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
        listProjects: projectExists,
        createTask: (task) => {
          created.push(task);
          return Promise.resolve({ id: 'task-2', title: task.title });
        },
      },
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(GRACE_MS + 1);

    expect(await sync.run(PROJECT)).toMatchObject({ remintedCopies: 1 });
    expect(keeper.content).toBe('- [ ] Buy milk ^tb-a1');
    expect(copy.content).toMatch(FRESH_ANCHOR);
    expect(copy.content).not.toContain('^tb-a1');
    expect(created).toEqual([]);

    await sync.run(PROJECT);
    jest.advanceTimersByTime(GRACE_MS + 1);
    await sync.run(PROJECT);

    expect(created).toHaveLength(1);
    expect(created[0].title).toBe('Buy milk');
    expect(created[0].description).toContain(copy.content.split(' ^')[1]);
  });

  it('touches nothing on the copied line but its anchor', async () => {
    jest.useFakeTimers();
    const keeper = new FakeNote('- [ ] Buy milk ^tb-a1');
    const copied = ['\t- [ ] Buy milk #errands ^tb-a1', '\t\tremember the oat one', '\t\t- [ ] Check the date'];
    const copy = new FakeNote(['- [ ] Groceries ^tb-top', ...copied].join('\n'));
    const tasks: LooseProviderTask[] = [{ id: TASK_ID, title: 'Buy milk' }];
    const sync = makeMultiFileSync(
      new Map([
        ['Keeper.md', keeper],
        ['Copy.md', copy],
      ]),
      linkedTo('Keeper.md'),
      {
        listTasks: () => Promise.resolve(tasks),
        listProjects: projectExists,
        createTask: (task) => {
          const created = { id: 'task-top', title: task.title, description: task.description };
          tasks.push(created);
          return Promise.resolve(created);
        },
      },
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(GRACE_MS + 1);
    await sync.run(PROJECT);

    const lines = copy.content.split('\n');

    expect(lines[0]).toBe('- [ ] Groceries ^tb-top');
    expect(lines[1]).toMatch(/^\t- \[ \] Buy milk #errands \^tb-[a-z0-9]{8}$/);
    expect(lines[2]).toBe('\t\tremember the oat one');
    expect(lines[3]).toMatch(/^\t\t- \[ \] Check the date(?: \^tb-[a-z0-9]{8})?$/);
    expect(lines).toHaveLength(4);
  });

  it('re-mints the second of two lines in one note and leaves the first alone', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('- [ ] Buy milk ^tb-a1\n- [ ] Buy milk ^tb-a1');
    const sync = makeMultiFileSync(new Map([['Tasks.md', note]]), linkedTo('Tasks.md'), {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      listProjects: projectExists,
    });

    await sync.run(PROJECT);
    jest.advanceTimersByTime(GRACE_MS + 1);

    expect(await sync.run(PROJECT)).toMatchObject({ remintedCopies: 1 });

    const lines = note.content.split('\n');

    expect(lines[0]).toBe('- [ ] Buy milk ^tb-a1');
    expect(lines[1]).toMatch(FRESH_ANCHOR);
    expect(lines[1]).not.toContain('^tb-a1');
  });

  it('re-mints nothing for a duplicate that is gone before its grace period is up', async () => {
    jest.useFakeTimers();
    const keeper = new FakeNote('- [ ] Buy milk ^tb-a1');
    const copy = new FakeNote('- [ ] Buy milk ^tb-a1');
    const notes = new Map([
      ['Keeper.md', keeper],
      ['Copy.md', copy],
    ]);
    const createTask = jest.fn();
    const sync = makeMultiFileSync(notes, linkedTo('Keeper.md'), {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk' }),
      listProjects: projectExists,
      createTask,
    });

    await sync.run(PROJECT);
    copy.content = '';
    jest.advanceTimersByTime(GRACE_MS + 1);

    expect(await sync.run(PROJECT)).toMatchObject({ remintedCopies: 0 });
    expect(keeper.content).toBe('- [ ] Buy milk ^tb-a1');
    expect(createTask).not.toHaveBeenCalled();
  });
});
