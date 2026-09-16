import * as obsidian from 'obsidian';
import TaskBridgePlugin from '../main';
import { TaskProviderError } from '../services/task-provider-error';
import {
  PluginContext,
  makePlugin,
  settingsWith,
  tfile,
} from './support/plugin-harness';

const INBOX_PROJECT = { id: 'inbox-1', name: 'Inbox', isDefault: true };
/** Just past the scheduler's 10s debounce, so a scheduled follow-up pass has certainly fired. */
const SYNC_DEBOUNCE_GRACE_MS = 10_500;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TaskBridgePlugin task sync', () => {
  function syncablePlugin(): PluginContext {
    const context = makePlugin(() => Promise.resolve({ id: 'u1', displayName: 'Jan' }));
    context.plugin.settings = settingsWith({
      relativeTaskSourcePath: 'Tasks.md',
      projectId: 'p1',
    });

    return context;
  }

  function taskSyncOf(plugin: TaskBridgePlugin): { run: jest.Mock } {
    const run = jest.fn().mockResolvedValue({
      created: 0,
      pushed: 0,
      pulled: 0,
      projectResolution: { kind: 'configured' },
    });
    (plugin as unknown as { taskSync: { run: jest.Mock } }).taskSync = { run };

    return { run };
  }

  it('syncs the configured project', async () => {
    const { plugin } = syncablePlugin();
    const { run } = taskSyncOf(plugin);

    await plugin.syncTasks();

    expect(run).toHaveBeenCalledWith('p1');
  });

  it('skips syncing while no source note is configured', async () => {
    const { plugin } = syncablePlugin();
    plugin.settings = settingsWith({ projectId: 'p1' });
    const { run } = taskSyncOf(plugin);

    await plugin.syncTasks();

    expect(run).not.toHaveBeenCalled();
  });

  it('still syncs when no project is configured, leaving the choice to the engine', async () => {
    const { plugin } = syncablePlugin();
    plugin.settings = settingsWith({ relativeTaskSourcePath: 'Tasks.md' });
    const { run } = taskSyncOf(plugin);

    await plugin.syncTasks();

    expect(run).toHaveBeenCalledWith('');
  });

  it('remembers the project the engine settled on', async () => {
    const { plugin, saveData } = syncablePlugin();
    taskSyncOf(plugin).run.mockResolvedValue({
      created: 0,
      pushed: 0,
      pulled: 0,
      projectResolution: { kind: 'defaulted', project: INBOX_PROJECT },
    });

    await plugin.syncTasks();

    expect(plugin.settings.projectId).toBe('inbox-1');
    expect(plugin.settings.projectName).toBe('Inbox');
    expect(saveData).toHaveBeenCalled();
  });

  it('tells the user when a deleted project sent tasks somewhere else', async () => {
    const notice = jest
      .spyOn(obsidian, 'Notice')
      .mockImplementation(() => undefined as unknown as obsidian.Notice);
    const { plugin } = syncablePlugin();
    plugin.settings.projectName = 'Errands';
    taskSyncOf(plugin).run.mockResolvedValue({
      created: 0,
      pushed: 0,
      pulled: 0,
      projectResolution: { kind: 'replaced', project: INBOX_PROJECT },
    });

    await plugin.syncTasks();

    expect(notice).toHaveBeenCalledWith(
      expect.stringContaining('"Errands" no longer exists'),
      expect.any(Number),
    );
  });

  it('stays quiet when it merely adopted the default project', async () => {
    const notice = jest
      .spyOn(obsidian, 'Notice')
      .mockImplementation(() => undefined as unknown as obsidian.Notice);
    const { plugin } = syncablePlugin();
    taskSyncOf(plugin).run.mockResolvedValue({
      created: 0,
      pushed: 0,
      pulled: 0,
      projectResolution: { kind: 'defaulted', project: INBOX_PROJECT },
    });

    await plugin.syncTasks();

    expect(notice).not.toHaveBeenCalled();
  });

  it('does not start a second pass while one is still running', async () => {
    const { plugin } = syncablePlugin();
    const { run } = taskSyncOf(plugin);
    let release = (): void => undefined;
    run.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({
        created: 0,
        pushed: 0,
        pulled: 0,
        projectResolution: { kind: 'configured' },
      });
    }));

    const first = plugin.syncTasks();
    await plugin.syncTasks();
    release();
    await first;

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('warns without a notice when the failure resolves on its own', async () => {
    const notice = jest
      .spyOn(obsidian, 'Notice')
      .mockImplementation(() => undefined as unknown as obsidian.Notice);
    const { plugin } = syncablePlugin();
    taskSyncOf(plugin).run.mockRejectedValue(new TaskProviderError('unreachable'));

    await plugin.syncTasks();

    expect(notice).not.toHaveBeenCalled();
  });

  it('tells the user once about a failure that will not fix itself', async () => {
    const notice = jest
      .spyOn(obsidian, 'Notice')
      .mockImplementation(() => undefined as unknown as obsidian.Notice);
    const { plugin } = syncablePlugin();
    taskSyncOf(plugin).run.mockRejectedValue(new TaskProviderError('project-missing'));

    await plugin.syncTasks();
    await plugin.syncTasks();

    expect(notice).toHaveBeenCalledTimes(1);
  });

  it('speaks up again once a different failure appears', async () => {
    const notice = jest
      .spyOn(obsidian, 'Notice')
      .mockImplementation(() => undefined as unknown as obsidian.Notice);
    const { plugin } = syncablePlugin();
    const { run } = taskSyncOf(plugin);

    run.mockRejectedValueOnce(new TaskProviderError('project-missing'));
    await plugin.syncTasks();
    run.mockRejectedValueOnce(new TaskProviderError('invalid-credentials'));
    await plugin.syncTasks();

    expect(notice).toHaveBeenCalledTimes(2);
  });

  it('registers a "Sync now" command without repeating the plugin name', async () => {
    const { plugin } = syncablePlugin();
    const addCommand = jest.spyOn(plugin, 'addCommand').mockImplementation((command) => command);

    await plugin.onload();

    expect(addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sync-now', name: 'Sync now' }),
    );
  });

  it('persists the task links alongside the settings', async () => {
    const { plugin, saveData } = makePlugin();
    plugin.taskLinks.set({ blockId: 'tb-a1', providerTaskId: 't1', lastSyncedTitle: 'Buy milk' });

    await plugin.saveSettings();

    expect(saveData).toHaveBeenCalledWith(
      expect.objectContaining({
        taskLinks: [{ blockId: 'tb-a1', providerTaskId: 't1', lastSyncedTitle: 'Buy milk' }],
      }),
    );
  });

  it('restores the task links that were stored last time', async () => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({
      taskLinks: [{ blockId: 'tb-a1', providerTaskId: 't1', lastSyncedTitle: 'Buy milk' }],
    });

    await plugin.loadSettings();

    expect(plugin.taskLinks.get('tb-a1')?.providerTaskId).toBe('t1');
  });

  it('starts with no links when the stored ones are unreadable', async () => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ taskLinks: 'corrupted' });

    await plugin.loadSettings();

    expect(plugin.taskLinks.size).toBe(0);
  });

  it('persists the orphaned-task tracking alongside the settings', async () => {
    const { plugin, saveData } = makePlugin();
    plugin.orphanedTasks.track('t1', 1_000);

    await plugin.saveSettings();

    expect(saveData).toHaveBeenCalledWith(
      expect.objectContaining({
        orphanedTasks: [{ providerTaskId: 't1', firstSeenOrphanedAt: 1_000 }],
      }),
    );
  });

  it('restores the orphaned-task tracking that was stored last time', async () => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({
      orphanedTasks: [{ providerTaskId: 't1', firstSeenOrphanedAt: 1_000 }],
    });

    await plugin.loadSettings();

    expect(plugin.orphanedTasks.get('t1')).toEqual({ providerTaskId: 't1', firstSeenOrphanedAt: 1_000 });
  });
});

describe('TaskBridgePlugin edits made while syncing', () => {
  function settle(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  function pausedSync(plugin: TaskBridgePlugin): { run: jest.Mock; finish: () => void } {
    const run = jest.fn();
    let finish = (): void => undefined;

    run.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              created: 0,
              pushed: 0,
              pulled: 0,
              reassignedTo: null,
              replacedMissingProject: false,
            });
        }),
    );
    (plugin as unknown as { taskSync: { run: jest.Mock } }).taskSync = { run };

    return { run, finish: () => finish() };
  }

  /** Lets the sync that `onload` starts finish first, so only the test's own passes are counted. */
  async function loadedPlugin(): Promise<PluginContext & { run: jest.Mock; finish: () => void }> {
    const context = makePlugin(() => Promise.resolve({ id: 'u1', displayName: 'Jan' }));
    await context.plugin.onload();
    await settle();

    context.plugin.settings = settingsWith({
      relativeTaskSourcePath: 'Tasks.md',
      projectId: 'p1',
    });
    jest.useFakeTimers();

    return { ...context, ...pausedSync(context.plugin) };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs again when the note is edited while a sync is in flight', async () => {
    const { plugin, vault, run, finish } = await loadedPlugin();

    const first = plugin.syncTasks();
    vault.trigger('modify', tfile('Tasks.md'));
    finish();
    await first;
    jest.advanceTimersByTime(SYNC_DEBOUNCE_GRACE_MS);
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not run again when nothing touched the note', async () => {
    const { plugin, run, finish } = await loadedPlugin();

    const first = plugin.syncTasks();
    finish();
    await first;
    jest.advanceTimersByTime(SYNC_DEBOUNCE_GRACE_MS);
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('ignores an edit to a note that is not the source note', async () => {
    const { plugin, vault, run, finish } = await loadedPlugin();

    const first = plugin.syncTasks();
    vault.trigger('modify', tfile('Other.md'));
    finish();
    await first;
    jest.advanceTimersByTime(SYNC_DEBOUNCE_GRACE_MS);
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);
  });
});
