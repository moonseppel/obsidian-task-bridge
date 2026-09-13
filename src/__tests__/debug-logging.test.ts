import { TaskLinkStore } from '../services/sync/task-links';
import { setDebugLogging } from '../utils/logger';
import { FakeNote, PROJECT, TASK_ID, makeSync, projectExists, remoteTasks } from './support/sync-harness';
import { VALID_USER, clientReplying } from './support/todoist-client-harness';

const PRIVATE = 'PRIVATE-NOTE-TEXT';
const TOKEN = 'PRIVATE-API-TOKEN';

function everythingLogged(): () => string {
  const levels = ['debug', 'info', 'warn', 'error'] as const;
  const spies = levels.map((level) => jest.spyOn(console, level).mockImplementation());

  return () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

async function syncTouchingEveryField(): Promise<void> {
  const links = new TaskLinkStore([
    { blockId: 'ots-a1', providerTaskId: TASK_ID, lastSyncedTitle: `${PRIVATE} title` },
  ]);
  const note = new FakeNote(
    [
      `- [ ] ${PRIVATE} title #${PRIVATE}tag ^ots-a1`,
      `\t${PRIVATE} description`,
      `- [ ] ${PRIVATE} brand new`,
    ].join('\n'),
  );
  const sync = makeSync(note, links, {
    listTasks: remoteTasks({
      id: TASK_ID,
      title: `${PRIVATE} renamed`,
      description: [`${PRIVATE} remote description`, '', 'Obsidian Task Sync ID: ^ots-a1'].join('\n'),
      embeddedBlockId: 'ots-a1',
    }),
    listProjects: projectExists,
    createTask: (task) => Promise.resolve({ id: 'new-task', title: task.title }),
    updateTaskDescription: () => Promise.resolve(),
    updateTaskLabels: () => Promise.resolve(),
  });

  await sync.run(PROJECT);
}

describe('Debug logging', () => {
  beforeEach(() => {
    setDebugLogging(true);
  });

  afterEach(() => {
    setDebugLogging(false);
    jest.restoreAllMocks();
  });

  it('records sync decisions by block id', async () => {
    const logged = everythingLogged();

    await syncTouchingEveryField();

    expect(logged()).toContain('ots-a1');
  });

  it('never records a title, description, tag or any other note text', async () => {
    const logged = everythingLogged();

    await syncTouchingEveryField();

    expect(logged()).not.toContain(PRIVATE);
  });

  it('records each Todoist request with its path and status', async () => {
    const logged = everythingLogged();
    const context = clientReplying(() => Promise.resolve({ status: 200, text: JSON.stringify(VALID_USER) }), TOKEN);

    await context.client.fetchUser();

    expect(logged()).toContain('"path":"/user","status":200');
  });

  it('never records the API token', async () => {
    const logged = everythingLogged();
    const context = clientReplying(() => Promise.resolve({ status: 200, text: JSON.stringify(VALID_USER) }), TOKEN);

    await context.client.fetchUser();

    expect(logged()).not.toContain(TOKEN);
  });
});
