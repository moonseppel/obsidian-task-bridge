import { orphanNoticeDescription } from '../services/sync/orphan-notice';
import { OrphanTracker } from '../services/sync/orphan-tracker';
import { TaskLinkStore } from '../services/sync/task-links';
import {
  FakeNote,
  PROJECT,
  TASK_ID,
  bareBlockIdDescription,
  makeSync,
  remoteTasks,
} from './support/sync-harness';

describe('TaskSync orphan lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
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
