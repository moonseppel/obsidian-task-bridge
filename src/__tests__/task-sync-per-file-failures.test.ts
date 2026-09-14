import { OrphanTracker } from '../services/sync/orphan-tracker';
import { TaskLinkStore } from '../services/sync/task-links';
import { TaskProviderError } from '../services/task-provider-error';
import { Logger } from '../utils/logger';
import { FakeNote, PROJECT, makeMultiFileSync, projectExists, remoteTasks } from './support/sync-harness';

const BAD_NOTE_TASK = { id: 'bad-task', title: 'Bad title', embeddedBlockId: 'ots-bad', projectId: PROJECT };
const GOOD_NOTE_TASK = { id: 'good-task', title: 'Already in sync', embeddedBlockId: 'ots-good', projectId: PROJECT };

/** A file whose title update always fails with a non-transient error, alongside one that never does. */
function twoNoteScope(): { notes: Map<string, FakeNote>; links: TaskLinkStore } {
  const notes = new Map([
    ['Bad.md', new FakeNote('- [ ] Renamed locally ^ots-bad')],
    ['Good.md', new FakeNote('- [ ] A brand new task')],
  ]);
  const links = new TaskLinkStore([{ blockId: 'ots-bad', providerTaskId: 'bad-task', lastSyncedTitle: 'Bad title' }]);

  return { notes, links };
}

/**
 * Like `twoNoteScope`, but the good note is already fully settled with its remote task, so it stays
 * stable across several `run()` calls in a row instead of needing a `getTask` stub for its own sake.
 */
function twoNoteScopeAcrossManyRuns(): { notes: Map<string, FakeNote>; links: TaskLinkStore } {
  const notes = new Map([
    ['Bad.md', new FakeNote('- [ ] Renamed locally ^ots-bad')],
    ['Good.md', new FakeNote('- [ ] Already in sync ^ots-good')],
  ]);
  const links = new TaskLinkStore([
    { blockId: 'ots-bad', providerTaskId: 'bad-task', lastSyncedTitle: 'Bad title' },
    { blockId: 'ots-good', providerTaskId: 'good-task', lastSyncedTitle: 'Already in sync' },
  ]);

  return { notes, links };
}

describe("TaskSync isolating one note's failure from the rest of the run", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('still syncs every other note when one note fails partway through', async () => {
    const { notes, links } = twoNoteScope();
    const created: string[] = [];
    const sync = makeMultiFileSync(notes, links, {
      listTasks: remoteTasks(BAD_NOTE_TASK),
      listProjects: projectExists,
      updateTaskTitle: () => Promise.reject(new TaskProviderError('unexpected', 'content too long')),
      createTask: (task) => {
        created.push(task.title);
        return Promise.resolve({ id: 'new-task', title: task.title });
      },
    });

    const outcome = await sync.run(PROJECT);

    expect(created).toEqual(['A brand new task']);
    expect(outcome.created).toBe(1);
  });

  it('does not throw out of run() when a note fails, so the caller sees a normal outcome', async () => {
    const { notes, links } = twoNoteScope();
    const sync = makeMultiFileSync(notes, links, {
      listTasks: remoteTasks(BAD_NOTE_TASK),
      listProjects: projectExists,
      updateTaskTitle: () => Promise.reject(new TaskProviderError('unexpected', 'content too long')),
      createTask: (task) => Promise.resolve({ id: 'new-task', title: task.title }),
    });

    await expect(sync.run(PROJECT)).resolves.toBeDefined();
  });

  it('keeps a task already linked in a note that fails before it can even be read from being orphaned', async () => {
    const notes = new Map([
      ['Bad.md', new FakeNote('- [ ] Renamed locally ^ots-bad')],
      ['Good.md', new FakeNote('- [ ] A brand new task')],
    ]);
    notes.get('Bad.md')!.read = () => Promise.reject(new Error('vault read failed'));
    const links = new TaskLinkStore([
      { blockId: 'ots-bad', providerTaskId: 'bad-task', lastSyncedTitle: 'Bad title', lastKnownFilePath: 'Bad.md' },
    ]);
    const orphans = new OrphanTracker();
    const sync = makeMultiFileSync(
      notes,
      links,
      {
        listTasks: remoteTasks(BAD_NOTE_TASK),
        listProjects: projectExists,
        createTask: (task) => Promise.resolve({ id: 'new-task', title: task.title }),
      },
      { orphans },
    );

    await sync.run(PROJECT);

    expect(orphans.get('bad-task')).toBeUndefined();
  });

  it('still syncs the good note when a different note fails before it can even be read', async () => {
    const notes = new Map([
      ['Bad.md', new FakeNote('- [ ] Renamed locally ^ots-bad')],
      ['Good.md', new FakeNote('- [ ] A brand new task')],
    ]);
    notes.get('Bad.md')!.read = () => Promise.reject(new Error('vault read failed'));
    const links = new TaskLinkStore([{ blockId: 'ots-bad', providerTaskId: 'bad-task', lastSyncedTitle: 'Bad title' }]);
    const created: string[] = [];
    const sync = makeMultiFileSync(notes, links, {
      listTasks: remoteTasks(BAD_NOTE_TASK),
      listProjects: projectExists,
      createTask: (task) => {
        created.push(task.title);
        return Promise.resolve({ id: 'new-task', title: task.title });
      },
    });

    await sync.run(PROJECT);

    expect(created).toEqual(['A brand new task']);
  });

  it('logs the failure at error level the first time, by note path', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { notes, links } = twoNoteScope();
    const sync = makeMultiFileSync(notes, links, {
      listTasks: remoteTasks(BAD_NOTE_TASK),
      listProjects: projectExists,
      updateTaskTitle: () => Promise.reject(new TaskProviderError('unexpected', 'content too long')),
      createTask: (task) => Promise.resolve({ id: 'new-task', title: task.title }),
    });

    await sync.run(PROJECT);

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Bad.md'), expect.any(TaskProviderError));
  });

  it('logs a repeat of the same failure at debug rather than error again', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const { notes, links } = twoNoteScopeAcrossManyRuns();
    const sync = makeMultiFileSync(notes, links, {
      listTasks: remoteTasks(BAD_NOTE_TASK, GOOD_NOTE_TASK),
      listProjects: projectExists,
      updateTaskTitle: () => Promise.reject(new TaskProviderError('unexpected', 'content too long')),
    });

    await sync.run(PROJECT);
    await sync.run(PROJECT);

    expect(error).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith('Note failed to sync again for the same reason', { path: 'Bad.md' });
  });

  it('logs at warn, not error, when the failure is transient and will retry on its own', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { notes, links } = twoNoteScope();
    const sync = makeMultiFileSync(notes, links, {
      listTasks: remoteTasks(BAD_NOTE_TASK),
      listProjects: projectExists,
      updateTaskTitle: () => Promise.reject(new TaskProviderError('unreachable')),
      createTask: (task) => Promise.resolve({ id: 'new-task', title: task.title }),
    });

    await sync.run(PROJECT);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Bad.md'), expect.any(TaskProviderError));
    expect(error).not.toHaveBeenCalled();
  });

  it('logs at error again once a note starts failing for a genuinely different reason', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { notes, links } = twoNoteScopeAcrossManyRuns();
    let secondFailure: () => Promise<never> = () =>
      Promise.reject(new TaskProviderError('unexpected', 'content too long'));
    const sync = makeMultiFileSync(notes, links, {
      listTasks: remoteTasks(BAD_NOTE_TASK, GOOD_NOTE_TASK),
      listProjects: projectExists,
      updateTaskTitle: () => secondFailure(),
    });

    await sync.run(PROJECT);
    // A different bug entirely, not just a different Todoist failure code with the same meaning.
    secondFailure = () => Promise.reject(new Error('an unrelated bug'));
    await sync.run(PROJECT);

    expect(error).toHaveBeenCalledTimes(2);
  });

  it('resumes normal per-run reporting once a previously failing note succeeds again', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { notes, links } = twoNoteScopeAcrossManyRuns();
    let shouldFail = true;
    const sync = makeMultiFileSync(notes, links, {
      listTasks: remoteTasks(BAD_NOTE_TASK, GOOD_NOTE_TASK),
      listProjects: projectExists,
      updateTaskTitle: () =>
        shouldFail ? Promise.reject(new TaskProviderError('unexpected', 'content too long')) : Promise.resolve(),
    });

    await sync.run(PROJECT);
    shouldFail = false;
    await sync.run(PROJECT);
    shouldFail = true;
    // A push only happens when something actually changed since the two sides last agreed.
    notes.get('Bad.md')!.content = '- [ ] Renamed again ^ots-bad';
    await sync.run(PROJECT);

    expect(error).toHaveBeenCalledTimes(2);
  });
});
