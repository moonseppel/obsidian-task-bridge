import { TaskLinkStore } from '../services/sync/task-links';
import { OrphanTracker } from '../services/sync/orphan-tracker';
import { FakeNote, PROJECT, TASK_ID, makeSync, remoteTasks } from './support/sync-harness';

describe('TaskSync scope-exit handling', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not delete a missing-line task whose block id still exists outside the scanned scope', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote('# Nothing here'),
      links,
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-a1' }), removeTask },
      undefined,
      undefined,
      undefined,
      () => true, // still found in some other, non-ignored vault file
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('ots-a1')).toBeDefined();
  });

  it('still deletes a missing-line task immediately when it is not found anywhere else either', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote('# Nothing here'),
      links,
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'ots-a1' }), removeTask },
      undefined,
      undefined,
      undefined,
      () => false, // genuinely gone, the default for a sync that never wires scope
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ removedTask: 1 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
  });

  it('flags an out-of-scope task on the same timing an orphan is flagged', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const orphans = new OrphanTracker();
    const sync = makeSync(
      new FakeNote('# Nothing here'),
      links,
      {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Buy milk',
          embeddedBlockId: 'ots-a1',
          description: 'Obsidian Task Sync ID: ^ots-a1',
        }),
        updateTaskDescription,
      },
      undefined,
      undefined,
      orphans,
      () => true,
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60 * 60_000);
    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledTimes(1);
    expect(orphans.get(TASK_ID)?.removalDueAt).toBeDefined();
    // Still linked and not removed — only flagged with a courtesy notice so far.
    expect(links.get('ots-a1')).toBeDefined();
  });

  it('removes a flagged out-of-scope task once the full removal grace period has passed', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const orphans = new OrphanTracker();
    const sync = makeSync(
      new FakeNote('# Nothing here'),
      links,
      {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Buy milk',
          embeddedBlockId: 'ots-a1',
          description: 'Obsidian Task Sync ID: ^ots-a1',
        }),
        updateTaskDescription,
        removeTask,
      },
      undefined,
      undefined,
      orphans,
      () => true,
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60 * 60_000);
    await sync.run(PROJECT); // flags it
    jest.advanceTimersByTime(2 * 24 * 60 * 60_000);
    await sync.run(PROJECT);

    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    expect(orphans.get(TASK_ID)).toBeUndefined();
  });

  it('resolves an out-of-scope task the moment it re-enters scope, the same way re-linking resolves an orphan', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('# Nothing here');
    const links = new TaskLinkStore([
      { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const orphans = new OrphanTracker();
    const sync = makeSync(
      note,
      links,
      {
        listTasks: remoteTasks({
          id: TASK_ID,
          title: 'Buy milk',
          embeddedBlockId: 'ots-a1',
          description: 'Obsidian Task Sync ID: ^ots-a1',
        }),
        updateTaskDescription,
        removeTask,
      },
      undefined,
      undefined,
      orphans,
      () => true,
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60 * 60_000);
    await sync.run(PROJECT); // flags it

    expect(updateTaskDescription).toHaveBeenCalledTimes(1);

    // The line reappears (e.g. the file moved back into scope) before the removal deadline; it is
    // now found in the scanned scope itself, regardless of what existsOutsideIgnoredFiles reports.
    note.content = '- [ ] Buy milk ^ots-a1';
    await sync.run(PROJECT);

    expect(orphans.get(TASK_ID)).toBeUndefined();
    expect(removeTask).not.toHaveBeenCalled();
  });
});
