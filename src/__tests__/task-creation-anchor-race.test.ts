import { TaskLinkStore } from '../services/sync/task-links';
import { Logger } from '../utils/logger';
import { FakeNote, PROJECT, makeSync, projectExists, remoteTasks } from './support/sync-harness';

/** Something else changes the exact line being created, between the task's creation and its anchor write. */
function raceOnFirstAppend(note: FakeNote, editTo: string): void {
  const original = note.appendAnchorIfMissing.bind(note);
  let raced = false;

  note.appendAnchorIfMissing = async (lineNumber, blockId) => {
    if (!raced) {
      raced = true;
      note.content = editTo;
    }

    return original(lineNumber, blockId);
  };
}

describe('TaskSync creating a task whose line changes before the anchor can land', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('still anchors the task even if the line was merely edited in the meantime', async () => {
    // A race that only changes the title, say, is no reason to lose the task: the anchor still
    // lands on whatever the line now says, as long as it's still the same bare, anchor-less task.
    const note = new FakeNote('- [ ] Buy milk');
    raceOnFirstAppend(note, '- [ ] Buy oat milk');
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: 'race-task', title: task.title }),
    });

    const outcome = await sync.run(PROJECT);

    expect(outcome).toMatchObject({ created: 1, abandonedCreations: 0 });
    expect(note.content).toMatch(/^- \[ \] Buy oat milk \^ots-[a-z0-9]{8}$/);
  });

  it('undoes the task rather than leaving an untraceable duplicate when the line moved on entirely', async () => {
    // A race that turns the line into something else altogether (deleted, or no longer a task) really
    // does mean there is no line left to anchor to.
    const note = new FakeNote('- [ ] Buy milk');
    raceOnFirstAppend(note, 'Just a note now, not a task');
    const links = new TaskLinkStore();
    const removed: string[] = [];
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: 'race-task', title: task.title }),
      removeTask: (taskId) => {
        removed.push(taskId);
        return Promise.resolve();
      },
    });

    const outcome = await sync.run(PROJECT);

    expect(outcome).toMatchObject({ created: 0, abandonedCreations: 1 });
    expect(removed).toEqual(['race-task']);
    expect(links.size).toBe(0);
    expect(note.content).toBe('Just a note now, not a task');
  });

  it('logs the abandonment at warn, by block id and task id', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const note = new FakeNote('- [ ] Buy milk');
    raceOnFirstAppend(note, 'Just a note now, not a task');
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: 'race-task', title: task.title }),
      removeTask: () => Promise.resolve(),
    });

    await sync.run(PROJECT);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not anchor'),
      expect.objectContaining({ taskId: 'race-task' }),
    );
  });

  it('does not accumulate a second task for the line, since there is nothing left to retry', async () => {
    const note = new FakeNote('- [ ] Buy milk');
    raceOnFirstAppend(note, 'Just a note now, not a task');
    const created: string[] = [];
    const sync = makeSync(note, new TaskLinkStore(), {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => {
        created.push(task.title);
        return Promise.resolve({ id: `task-${created.length}`, title: task.title });
      },
      removeTask: () => Promise.resolve(),
    });

    await sync.run(PROJECT);
    await sync.run(PROJECT);

    expect(created).toEqual(['Buy milk']);
    expect(note.content).toBe('Just a note now, not a task');
  });

  it('still creates the task normally when nothing races it', async () => {
    const note = new FakeNote('- [ ] Buy milk');
    const links = new TaskLinkStore();
    const sync = makeSync(note, links, {
      listTasks: remoteTasks(),
      listProjects: projectExists,
      createTask: (task) => Promise.resolve({ id: 'task-1', title: task.title }),
    });

    const outcome = await sync.run(PROJECT);

    expect(outcome).toMatchObject({ created: 1, abandonedCreations: 0 });
    expect(note.content).toMatch(/^- \[ \] Buy milk \^ots-[a-z0-9]{8}$/);
    expect(links.size).toBe(1);
  });
});
