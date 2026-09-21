import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { OrphanTracker } from '../../../../services/sync/orphans/orphan-tracker';
import { FakeNote, PROJECT, TASK_ID, makeSync, projectExists, remoteTasks } from '../../../support/sync-harness';

describe('TaskSync scope-exit handling', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not delete a missing-line task whose block id still exists outside the scanned scope', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote('# Nothing here'),
      links,
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'tb-a1' }), removeTask },
      { existsOutsideIgnoredFiles: () => true }, // still found in some other, non-ignored vault file
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);
    await sync.run(PROJECT);

    expect(removeTask).not.toHaveBeenCalled();
    expect(links.get('tb-a1')).toBeDefined();
  });

  it('still deletes a missing-line task immediately when it is not found anywhere else either', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
    ]);
    const removeTask = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(
      new FakeNote('# Nothing here'),
      links,
      { listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'tb-a1' }), removeTask },
      { existsOutsideIgnoredFiles: () => false }, // genuinely gone, the default for a sync that never wires scope
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60_000);

    expect(await sync.run(PROJECT)).toMatchObject({ removedTask: 1 });
    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
  });

  it('flags an out-of-scope task on the same timing an orphan is flagged', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
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
          embeddedBlockId: 'tb-a1',
          description: 'TaskBridge ID: ^tb-a1',
        }),
        updateTaskDescription,
      },
      { orphans, existsOutsideIgnoredFiles: () => true },
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60 * 60_000);
    await sync.run(PROJECT);

    expect(updateTaskDescription).toHaveBeenCalledTimes(1);
    expect(orphans.get(TASK_ID)?.removalDueAt).toBeDefined();
    // Still linked and not removed — only flagged with a courtesy notice so far.
    expect(links.get('tb-a1')).toBeDefined();
  });

  it('removes a flagged out-of-scope task once the full removal grace period has passed', async () => {
    jest.useFakeTimers();
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
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
          embeddedBlockId: 'tb-a1',
          description: 'TaskBridge ID: ^tb-a1',
        }),
        updateTaskDescription,
        removeTask,
      },
      { orphans, existsOutsideIgnoredFiles: () => true },
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60 * 60_000);
    await sync.run(PROJECT); // flags it
    jest.advanceTimersByTime(2 * 24 * 60 * 60_000);
    await sync.run(PROJECT);

    expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    expect(orphans.get(TASK_ID)).toBeUndefined();
  });

  describe('a line that falls out of the tag filter', () => {
    /** Mirrors the vault: the block id is still anchored in a scanned, non-ignored note. */
    const STILL_IN_THE_VAULT = { existsOutsideIgnoredFiles: () => true };
    const carriesWorkTag = (task: { tags: readonly string[] }): boolean => task.tags.includes('work');

    const anchoredTask = {
      id: TASK_ID,
      title: 'Buy milk',
      embeddedBlockId: 'tb-a1',
      description: 'TaskBridge ID: ^tb-a1',
    };

    it('stops counting as found, and is flagged and then removed on the out-of-scope lifecycle', async () => {
      jest.useFakeTimers();
      const links = new TaskLinkStore([
        { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
      ]);
      const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
      const removeTask = jest.fn().mockResolvedValue(undefined);
      const orphans = new OrphanTracker();
      const sync = makeSync(
        new FakeNote('- [ ] Buy milk #home ^tb-a1'),
        links,
        { listTasks: remoteTasks(anchoredTask), updateTaskDescription, removeTask },
        { ...STILL_IN_THE_VAULT, orphans, isTagInScope: carriesWorkTag },
      );

      await sync.run(PROJECT);
      jest.advanceTimersByTime(60 * 60_000);
      await sync.run(PROJECT);

      expect(updateTaskDescription).toHaveBeenCalledTimes(1);
      expect(orphans.get(TASK_ID)?.removalDueAt).toBeDefined();

      jest.advanceTimersByTime(2 * 24 * 60 * 60_000);
      await sync.run(PROJECT);

      expect(removeTask).toHaveBeenCalledWith(TASK_ID);
    });

    it('reverts the notice and drops the tracking once the tag comes back', async () => {
      jest.useFakeTimers();
      const note = new FakeNote('- [ ] Buy milk #home ^tb-a1');
      const links = new TaskLinkStore([
        { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
      ]);
      const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
      const removeTask = jest.fn().mockResolvedValue(undefined);
      const orphans = new OrphanTracker();
      const sync = makeSync(
        note,
        links,
        { listTasks: remoteTasks(anchoredTask), updateTaskDescription, removeTask },
        { ...STILL_IN_THE_VAULT, orphans, isTagInScope: carriesWorkTag },
      );

      await sync.run(PROJECT);
      jest.advanceTimersByTime(60 * 60_000);
      await sync.run(PROJECT); // flags it

      expect(orphans.get(TASK_ID)?.removalDueAt).toBeDefined();

      note.content = '- [ ] Buy milk #work ^tb-a1';
      await sync.run(PROJECT);

      expect(updateTaskDescription).toHaveBeenLastCalledWith(TASK_ID, 'TaskBridge ID: ^tb-a1');
      expect(orphans.get(TASK_ID)).toBeUndefined();
      expect(removeTask).not.toHaveBeenCalled();
    });

    it('promotes the still-linked children of a removed task before removing it', async () => {
      jest.useFakeTimers();
      const links = new TaskLinkStore([
        { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
        { blockId: 'tb-b2', providerTaskId: 'child-1', lastSyncedTitle: 'Buy oat milk' },
      ]);
      const calls: string[] = [];
      const orphans = new OrphanTracker();
      const sync = makeSync(
        new FakeNote('- [ ] Buy milk #home ^tb-a1\n\t- [ ] Buy oat milk #work ^tb-b2'),
        links,
        {
          listTasks: remoteTasks(anchoredTask, {
            id: 'child-1',
            title: 'Buy oat milk',
            parentId: TASK_ID,
            embeddedBlockId: 'tb-b2',
            description: 'TaskBridge ID: ^tb-b2',
          }),
          updateTaskDescription: jest.fn().mockResolvedValue(undefined),
          reparentTask: (taskId) => {
            calls.push(`reparent:${taskId}`);
            return Promise.resolve(true);
          },
          removeTask: (taskId) => {
            calls.push(`remove:${taskId}`);
            return Promise.resolve();
          },
        },
        { ...STILL_IN_THE_VAULT, orphans, isTagInScope: carriesWorkTag },
      );

      await sync.run(PROJECT);
      jest.advanceTimersByTime(60 * 60_000);
      await sync.run(PROJECT);
      jest.advanceTimersByTime(2 * 24 * 60 * 60_000);
      await sync.run(PROJECT);

      expect(calls).toEqual(['reparent:child-1', `remove:${TASK_ID}`]);
    });

    it('creates no task for an unlinked line while it is out of tag scope', async () => {
      const createTask = jest.fn();
      const sync = makeSync(
        new FakeNote('- [ ] Buy milk #home'),
        new TaskLinkStore(),
        { listTasks: remoteTasks(), listProjects: projectExists, createTask },
        { ...STILL_IN_THE_VAULT, isTagInScope: carriesWorkTag },
      );

      await sync.run(PROJECT);

      expect(createTask).not.toHaveBeenCalled();
    });
  });

  it('resolves an out-of-scope task the moment it re-enters scope, as re-linking resolves an orphan', async () => {
    jest.useFakeTimers();
    const note = new FakeNote('# Nothing here');
    const links = new TaskLinkStore([
      { blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' },
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
          embeddedBlockId: 'tb-a1',
          description: 'TaskBridge ID: ^tb-a1',
        }),
        updateTaskDescription,
        removeTask,
      },
      { orphans, existsOutsideIgnoredFiles: () => true },
    );

    await sync.run(PROJECT);
    jest.advanceTimersByTime(60 * 60_000);
    await sync.run(PROJECT); // flags it

    expect(updateTaskDescription).toHaveBeenCalledTimes(1);

    // The line reappears (e.g. the file moved back into scope) before the removal deadline; it is
    // now found in the scanned scope itself, regardless of what existsOutsideIgnoredFiles reports.
    note.content = '- [ ] Buy milk ^tb-a1';
    await sync.run(PROJECT);

    expect(orphans.get(TASK_ID)).toBeUndefined();
    expect(removeTask).not.toHaveBeenCalled();
  });
});
