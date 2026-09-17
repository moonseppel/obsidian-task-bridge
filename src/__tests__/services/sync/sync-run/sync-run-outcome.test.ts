import { OrphanTracker } from '../../../../services/sync/orphans/orphan-tracker';
import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { FakeNote, PROJECT, TASK_ID, makeMultiFileSync, makeSync, remoteTasks } from '../../../support/sync-harness';

const ORPHAN = { id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'tb-orphan' };

describe('TaskSync run outcome', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts the notes scanned and the tasks linked once the run is done', async () => {
    const notes = new Map([
      ['A.md', new FakeNote('- [ ] First ^tb-a1')],
      ['B.md', new FakeNote('')],
    ]);
    const links = new TaskLinkStore([{ blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'First' }]);
    const sync = makeMultiFileSync(notes, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'First', embeddedBlockId: 'tb-a1' }),
    });

    const outcome = await sync.run(PROJECT);

    expect(outcome).toMatchObject({ filesScanned: 2, linkedTasks: 1 });
  });

  it('counts an edit left unwritten because its line changed while the sync ran', async () => {
    const note = new FakeNote('- [ ] Milk ^tb-a');
    const readBeforeTheUserTyped = note.read.bind(note);
    note.read = async (): Promise<string> => {
      const content = await readBeforeTheUserTyped();
      note.content = '- [ ] Milk typed meanwhile ^tb-a';
      return content;
    };
    const links = new TaskLinkStore([{ blockId: 'tb-a', providerTaskId: TASK_ID, lastSyncedTitle: 'Milk' }]);
    const sync = makeSync(note, links, {
      listTasks: remoteTasks({ id: TASK_ID, title: 'Oat milk', embeddedBlockId: 'tb-a' }),
    });

    const outcome = await sync.run(PROJECT);

    expect(outcome.skippedEdits).toBe(1);
  });

  it('counts an orphan flagged with its removal notice', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(2 * 60 * 60_000);
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 0);
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      { listTasks: remoteTasks(ORPHAN), updateTaskDescription: jest.fn().mockResolvedValue(undefined) },
      { orphans },
    );

    const outcome = await sync.run(PROJECT);

    expect(outcome.flaggedOrphans).toBe(1);
  });

  it('counts an orphan removed once its removal date passed', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 0);
    orphans.flag(TASK_ID, 5_000);
    const sync = makeSync(
      new FakeNote(''),
      new TaskLinkStore(),
      { listTasks: remoteTasks(ORPHAN), removeTask: jest.fn().mockResolvedValue(undefined) },
      { orphans },
    );

    const outcome = await sync.run(PROJECT);

    expect(outcome.removedOrphans).toBe(1);
  });

  it('counts a flagged task un-flagged once it is linked back', async () => {
    const orphans = new OrphanTracker();
    orphans.track(TASK_ID, 0);
    orphans.flag(TASK_ID, Date.now() + 60_000);
    const links = new TaskLinkStore([{ blockId: 'tb-a1', providerTaskId: TASK_ID, lastSyncedTitle: 'Buy milk' }]);
    const sync = makeSync(
      new FakeNote('- [ ] Buy milk ^tb-a1'),
      links,
      {
        listTasks: remoteTasks({ id: TASK_ID, title: 'Buy milk', embeddedBlockId: 'tb-a1' }),
        updateTaskDescription: jest.fn().mockResolvedValue(undefined),
      },
      { orphans },
    );

    const outcome = await sync.run(PROJECT);

    expect(outcome.unflaggedOrphans).toBe(1);
  });
});
