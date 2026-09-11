import * as obsidian from 'obsidian';
import { App, TFile } from 'obsidian';
import ObsidianTaskSyncPlugin from '../main';
import { DEFAULT_SETTINGS, ObsidianTaskSyncSettings } from '../settings';
import { isDebugLogging, setDebugLogging } from '../utils/logger';
import { ProviderConnection } from '../services/provider-connection';
import { stubProvider } from './support/stub-provider';
import { ProviderAccount } from '../services/task-provider';
import { TaskProviderError, TaskProviderFailure } from '../services/task-provider-error';

interface FakeVault {
  on: (event: string, cb: (...args: unknown[]) => void) => { event: string };
  trigger: (event: string, ...args: unknown[]) => void;
  getAbstractFileByPath: (path: string) => TFile | null;
  existingPaths: Set<string>;
}

function fakeVault(): FakeVault {
  const existingPaths = new Set(['Tasks.md']);
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    on(event, cb) {
      (handlers[event] ??= []).push(cb);
      return { event };
    },
    trigger(event, ...args) {
      (handlers[event] ?? []).forEach((cb) => cb(...args));
    },
    existingPaths,
    getAbstractFileByPath(path) {
      return existingPaths.has(path) ? tfile(path) : null;
    },
  };
}

interface PluginContext {
  plugin: ObsidianTaskSyncPlugin;
  vault: FakeVault;
  loadData: jest.SpyInstance;
  saveData: jest.SpyInstance;
  addSettingTab: jest.SpyInstance;
}

function settingsWith(overrides: Partial<ObsidianTaskSyncSettings> = {}): ObsidianTaskSyncSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function rejectingWith(failure: TaskProviderFailure): () => Promise<ProviderAccount> {
  return () => Promise.reject(new TaskProviderError(failure));
}

function makePlugin(connect = rejectingWith('not-configured')): PluginContext {
  const vault = fakeVault();
  const app = { vault, workspace: {} } as unknown as App;
  const manifest = {
    id: 'obsidian-task-sync',
    name: 'Obsidian Task Sync',
    version: '0.1.0',
    author: 'Test Author',
    minAppVersion: '0.15.0',
    description: 'Test plugin',
  };
  // Constructed rather than hand-assembled, so the plugin's own fields are wired as they are in use.
  const plugin = new ObsidianTaskSyncPlugin(app, manifest);
  plugin.connection = new ProviderConnection(stubProvider({ connect }));

  const loadData = jest.spyOn(plugin, 'loadData').mockResolvedValue(null);
  const saveData = jest.spyOn(plugin, 'saveData').mockResolvedValue(undefined);
  const addSettingTab = jest.spyOn(plugin, 'addSettingTab').mockImplementation(() => undefined);
  jest.spyOn(plugin, 'registerEvent').mockImplementation(() => undefined);

  return { plugin, vault, loadData, saveData, addSettingTab };
}

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  return file;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ObsidianTaskSyncPlugin', () => {
  describe('Plugin structure', () => {
    it('is an instance of ObsidianTaskSyncPlugin', () => {
      expect(makePlugin().plugin).toBeInstanceOf(ObsidianTaskSyncPlugin);
    });

    it('exposes an onload method', () => {
      expect(typeof makePlugin().plugin.onload).toBe('function');
    });

    it('exposes an onunload method', () => {
      expect(typeof makePlugin().plugin.onunload).toBe('function');
    });
  });

  describe('Lifecycle hooks', () => {
    it('onload resolves without throwing', async () => {
      await expect(makePlugin().plugin.onload()).resolves.toBeUndefined();
    });

    it('onunload resolves without throwing', async () => {
      await expect(makePlugin().plugin.onunload()).resolves.toBeUndefined();
    });

    it('registers a settings tab on load', async () => {
      const { plugin, addSettingTab } = makePlugin();
      await plugin.onload();
      expect(addSettingTab).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('onload catches unexpected initialization errors instead of throwing', async () => {
      const { plugin, addSettingTab } = makePlugin();
      addSettingTab.mockImplementation(() => {
        throw new Error('Simulated failure');
      });
      await expect(plugin.onload()).resolves.toBeUndefined();
    });

    it('recovers from an unreadable settings file and still loads the plugin', async () => {
      const { plugin, loadData, addSettingTab } = makePlugin();
      loadData.mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));

      await plugin.onload();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('');
      expect(addSettingTab).toHaveBeenCalledTimes(1);
    });

    it('warns the user when the settings file cannot be read', async () => {
      const notice = jest
        .spyOn(obsidian, 'Notice')
        .mockImplementation(() => undefined as unknown as obsidian.Notice);
      const { plugin, loadData } = makePlugin();
      loadData.mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));

      await plugin.loadSettings();

      expect(notice).toHaveBeenCalledWith(expect.stringContaining('settings file'));
    });
  });

  describe('Settings persistence', () => {
    it('loads persisted settings over the defaults', async () => {
      const { plugin, loadData } = makePlugin();
      loadData.mockResolvedValue({ relativeTaskSourceNotePath: 'Tasks.md' });
      await plugin.loadSettings();
      expect(plugin.settings.relativeTaskSourceNotePath).toBe('Tasks.md');
    });

    it('falls back to defaults when nothing is persisted', async () => {
      const { plugin } = makePlugin();
      await plugin.loadSettings();
      expect(plugin.settings.relativeTaskSourceNotePath).toBe('');
    });

    it('ignores malformed persisted data', async () => {
      const { plugin, loadData } = makePlugin();
      loadData.mockResolvedValue('not an object');
      await plugin.loadSettings();
      expect(plugin.settings.relativeTaskSourceNotePath).toBe('');
    });

    it('writes settings through saveData', async () => {
      const settings = settingsWith({ relativeTaskSourceNotePath: 'Done.md' });
      const { plugin, saveData } = makePlugin();
      plugin.settings = settings;
      await plugin.saveSettings();
      expect(saveData).toHaveBeenCalledWith({
        ...settings,
        taskLinks: [],
        knownProjects: [],
        providerCredentials: { apiTokenSecretName: '' },
      });
    });

    it('loads the credentials the provider stored last time', async () => {
      const { plugin, loadData } = makePlugin();
      loadData.mockResolvedValue({ providerCredentials: { apiTokenSecretName: 'todoist-token' } });
      await plugin.loadSettings();
      expect(plugin.credentials.toStored()).toEqual({ apiTokenSecretName: 'todoist-token' });
    });

    it('still reads a token secret stored before the credentials moved behind the provider', async () => {
      const { plugin, loadData } = makePlugin();
      loadData.mockResolvedValue({ todoistApiTokenSecretName: 'todoist-token' });
      await plugin.loadSettings();
      expect(plugin.credentials.toStored()).toEqual({ apiTokenSecretName: 'todoist-token' });
    });

    it('starts with no credentials when the stored ones are not text', async () => {
      const { plugin, loadData } = makePlugin();
      loadData.mockResolvedValue({ providerCredentials: { apiTokenSecretName: 42 } });
      await plugin.loadSettings();
      expect(plugin.credentials.toStored()).toEqual({ apiTokenSecretName: '' });
    });
  });

  describe('Task provider connection', () => {
    it('connects to the task provider on load', async () => {
      const { plugin } = makePlugin();
      const connect = jest.spyOn(plugin.connection, 'connect');

      await plugin.onload();

      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('reports the connected account in the connection status', async () => {
      const account = { id: 'user-1', displayName: 'Jan Pralle' };
      const { plugin } = makePlugin(() => Promise.resolve(account));

      await plugin.connectToTaskProvider();

      expect(plugin.connection.status).toEqual({ state: 'connected', account });
    });

    async function noticesFor(failure: TaskProviderFailure): Promise<jest.SpyInstance> {
      const notice = jest
        .spyOn(obsidian, 'Notice')
        .mockImplementation(() => undefined as unknown as obsidian.Notice);
      const { plugin } = makePlugin(rejectingWith(failure));

      await plugin.connectToTaskProvider();

      return notice;
    }

    it('warns the user when a configured token is refused', async () => {
      const notice = await noticesFor('invalid-credentials');
      expect(notice).toHaveBeenCalledWith(expect.stringContaining('rejected the API token'), expect.anything());
    });

    it('keeps a refused-token warning up until the user dismisses it', async () => {
      const notice = await noticesFor('invalid-credentials');
      expect(notice).toHaveBeenCalledWith(expect.any(String), 0);
    });

    it('asks the user to report an unexpected response', async () => {
      const notice = await noticesFor('unexpected');
      expect(notice).toHaveBeenCalledWith(expect.stringContaining('report this'), expect.anything());
    });

    it('stays quiet while the service is unreachable, which resolves on its own', async () => {
      expect(await noticesFor('unreachable')).not.toHaveBeenCalled();
    });

    it('stays quiet while rate limited, which resolves on its own', async () => {
      expect(await noticesFor('rate-limited')).not.toHaveBeenCalled();
    });

    it('stays quiet when no token has been configured yet', async () => {
      expect(await noticesFor('not-configured')).not.toHaveBeenCalled();
    });
  });

  describe('Source note watchers', () => {
    it('follows the configured source note when it is renamed', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = settingsWith({ relativeTaskSourceNotePath: 'Tasks.md' });

      vault.trigger('rename', tfile('archive/Tasks.md'), 'Tasks.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('archive/Tasks.md');
    });

    it('ignores renames of unrelated notes', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = settingsWith({ relativeTaskSourceNotePath: 'Tasks.md' });

      vault.trigger('rename', tfile('Other.md'), 'Renamed-from.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('Tasks.md');
    });

    it('clears the setting when the configured source note is deleted', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = settingsWith({ relativeTaskSourceNotePath: 'Tasks.md' });

      vault.trigger('delete', tfile('Tasks.md'));
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('');
    });

    it('notifies the user when the configured source note is deleted', async () => {
      const notice = jest
        .spyOn(obsidian, 'Notice')
        .mockImplementation(() => undefined as unknown as obsidian.Notice);
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = settingsWith({ relativeTaskSourceNotePath: 'Tasks.md' });

      vault.trigger('delete', tfile('Tasks.md'));
      await Promise.resolve();

      expect(notice).toHaveBeenCalledWith(expect.stringContaining('Tasks.md'));
    });

    it('clears the setting when the configured source note is moved to local trash', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = settingsWith({ relativeTaskSourceNotePath: 'Tasks.md' });

      vault.trigger('rename', tfile('.trash/Tasks.md'), 'Tasks.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('');
    });
  });
});

const INBOX_PROJECT = { id: 'inbox-1', name: 'Inbox', isDefault: true };

describe('ObsidianTaskSyncPlugin task sync', () => {
  function syncablePlugin(): PluginContext {
    const context = makePlugin(() => Promise.resolve({ id: 'u1', displayName: 'Jan' }));
    context.plugin.settings = settingsWith({
      relativeTaskSourceNotePath: 'Tasks.md',
      projectId: 'p1',
    });

    return context;
  }

  function titleSyncOf(plugin: ObsidianTaskSyncPlugin): { run: jest.Mock } {
    const run = jest.fn().mockResolvedValue({
      created: 0,
      pushed: 0,
      pulled: 0,
      projectResolution: { kind: 'configured' },
    });
    (plugin as unknown as { titleSync: { run: jest.Mock } }).titleSync = { run };

    return { run };
  }

  it('syncs the configured project', async () => {
    const { plugin } = syncablePlugin();
    const { run } = titleSyncOf(plugin);

    await plugin.syncTasks();

    expect(run).toHaveBeenCalledWith('p1');
  });

  it('skips syncing while no source note is configured', async () => {
    const { plugin } = syncablePlugin();
    plugin.settings = settingsWith({ projectId: 'p1' });
    const { run } = titleSyncOf(plugin);

    await plugin.syncTasks();

    expect(run).not.toHaveBeenCalled();
  });

  it('still syncs when no project is configured, leaving the choice to the engine', async () => {
    const { plugin } = syncablePlugin();
    plugin.settings = settingsWith({ relativeTaskSourceNotePath: 'Tasks.md' });
    const { run } = titleSyncOf(plugin);

    await plugin.syncTasks();

    expect(run).toHaveBeenCalledWith('');
  });

  it('remembers the project the engine settled on', async () => {
    const { plugin, saveData } = syncablePlugin();
    titleSyncOf(plugin).run.mockResolvedValue({
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
    titleSyncOf(plugin).run.mockResolvedValue({
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
    titleSyncOf(plugin).run.mockResolvedValue({
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
    const { run } = titleSyncOf(plugin);
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
    titleSyncOf(plugin).run.mockRejectedValue(new TaskProviderError('unreachable'));

    await plugin.syncTasks();

    expect(notice).not.toHaveBeenCalled();
  });

  it('tells the user once about a failure that will not fix itself', async () => {
    const notice = jest
      .spyOn(obsidian, 'Notice')
      .mockImplementation(() => undefined as unknown as obsidian.Notice);
    const { plugin } = syncablePlugin();
    titleSyncOf(plugin).run.mockRejectedValue(new TaskProviderError('project-missing'));

    await plugin.syncTasks();
    await plugin.syncTasks();

    expect(notice).toHaveBeenCalledTimes(1);
  });

  it('speaks up again once a different failure appears', async () => {
    const notice = jest
      .spyOn(obsidian, 'Notice')
      .mockImplementation(() => undefined as unknown as obsidian.Notice);
    const { plugin } = syncablePlugin();
    const { run } = titleSyncOf(plugin);

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
    plugin.taskLinks.set({ blockId: 'ots-a1', providerTaskId: 't1', lastSyncedTitle: 'Buy milk' });

    await plugin.saveSettings();

    expect(saveData).toHaveBeenCalledWith(
      expect.objectContaining({
        taskLinks: [{ blockId: 'ots-a1', providerTaskId: 't1', lastSyncedTitle: 'Buy milk' }],
      }),
    );
  });

  it('restores the task links that were stored last time', async () => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({
      taskLinks: [{ blockId: 'ots-a1', providerTaskId: 't1', lastSyncedTitle: 'Buy milk' }],
    });

    await plugin.loadSettings();

    expect(plugin.taskLinks.get('ots-a1')?.providerTaskId).toBe('t1');
  });

  it('starts with no links when the stored ones are unreadable', async () => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ taskLinks: 'corrupted' });

    await plugin.loadSettings();

    expect(plugin.taskLinks.size).toBe(0);
  });
});

describe('ObsidianTaskSyncPlugin debug mode', () => {
  function bodyClasses(): { hasClass(cls: string): boolean } {
    return document.body as unknown as { hasClass(cls: string): boolean };
  }

  afterEach(() => {
    setDebugLogging(false);
    document.body.removeClass('obsidian-task-sync-debug');
  });

  it.each([[false], [true]])('mirrors debug mode %s into debug logging', (debugMode) => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith({ debugMode });

    plugin.applyDebugMode();

    expect(isDebugLogging()).toBe(debugMode);
  });

  it.each([[false], [true]])('mirrors debug mode %s into anchor visibility', (debugMode) => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith({ debugMode });

    plugin.applyDebugMode();

    expect(bodyClasses().hasClass('obsidian-task-sync-debug')).toBe(debugMode);
  });

  it('remembers the stored choice', async () => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ debugMode: true });

    await plugin.loadSettings();

    expect(plugin.settings.debugMode).toBe(true);
  });

  it.each([['yes'], [1], [null]])('falls back to off when the stored value is %s', async (stored) => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ debugMode: stored });

    await plugin.loadSettings();

    expect(plugin.settings.debugMode).toBe(false);
  });

  it('stops marking the body once the plugin unloads', async () => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith({ debugMode: true });
    plugin.applyDebugMode();

    await plugin.onunload();

    expect(bodyClasses().hasClass('obsidian-task-sync-debug')).toBe(false);
  });
});

/** Comfortably past the two second debounce, but nowhere near the polling interval. */
const SYNC_DEBOUNCE_GRACE_MS = 10_500;

describe('ObsidianTaskSyncPlugin edits made while syncing', () => {
  function settle(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  function pausedSync(plugin: ObsidianTaskSyncPlugin): { run: jest.Mock; finish: () => void } {
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
    (plugin as unknown as { titleSync: { run: jest.Mock } }).titleSync = { run };

    return { run, finish: () => finish() };
  }

  /** Lets the sync that `onload` starts finish first, so only the test's own passes are counted. */
  async function loadedPlugin(): Promise<PluginContext & { run: jest.Mock; finish: () => void }> {
    const context = makePlugin(() => Promise.resolve({ id: 'u1', displayName: 'Jan' }));
    await context.plugin.onload();
    await settle();

    context.plugin.settings = settingsWith({
      relativeTaskSourceNotePath: 'Tasks.md',
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

describe('ObsidianTaskSyncPlugin remembered projects', () => {
  const PROJECT = { id: 'p1', name: 'Errands', isDefault: false };

  it('persists the project list alongside the settings', async () => {
    const { plugin, saveData } = makePlugin();
    plugin.knownProjects = [PROJECT];

    await plugin.saveSettings();

    expect(saveData).toHaveBeenCalledWith(expect.objectContaining({ knownProjects: [PROJECT] }));
  });

  it('restores the list from last time, so the picker works offline', async () => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ knownProjects: [PROJECT] });

    await plugin.loadSettings();

    expect(plugin.knownProjects).toEqual([PROJECT]);
  });

  it.each([
    ['not an array'],
    [[{ id: 'p1' }]],
    [[{ id: '', name: 'Nameless', isDefault: false }]],
    [[{ id: 'p1', name: 'Errands' }]],
  ])('drops a stored list that reads as %s', async (stored) => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ knownProjects: stored });

    await plugin.loadSettings();

    expect(plugin.knownProjects).toEqual([]);
  });

  it('keeps the previous list when the provider cannot be reached', async () => {
    const { plugin } = makePlugin();
    plugin.knownProjects = [PROJECT];
    (plugin as unknown as { provider: { listProjects: () => Promise<never> } }).provider = {
      listProjects: () => Promise.reject(new TaskProviderError('unreachable')),
    };

    await plugin.refreshKnownProjects();

    expect(plugin.knownProjects).toEqual([PROJECT]);
  });

  it('replaces the list on a successful refresh', async () => {
    const { plugin } = makePlugin();
    plugin.knownProjects = [PROJECT];
    (plugin as unknown as { provider: { listProjects: () => Promise<unknown> } }).provider = {
      listProjects: () => Promise.resolve([{ id: 'p2', name: 'Inbox', isDefault: true }]),
    };

    await plugin.refreshKnownProjects();

    expect(plugin.knownProjects).toEqual([{ id: 'p2', name: 'Inbox', isDefault: true }]);
  });
});

describe('ObsidianTaskSyncPlugin choosing a default project', () => {
  const INBOX = { id: 'inbox-1', name: 'Inbox', isDefault: true };

  function pluginWithProjects(projects: unknown[]): PluginContext {
    const context = makePlugin();
    (context.plugin as unknown as { provider: { listProjects: () => Promise<unknown> } }).provider = {
      listProjects: () => Promise.resolve(projects),
    };

    return context;
  }

  it('asks for the project list when nothing has been remembered yet', async () => {
    const { plugin } = pluginWithProjects([INBOX]);
    plugin.settings = settingsWith();

    await plugin.ensureProjectSelected();

    expect(plugin.settings.projectId).toBe('inbox-1');
    expect(plugin.settings.projectName).toBe('Inbox');
  });

  it('uses the remembered list rather than asking again', async () => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith();
    plugin.knownProjects = [INBOX];

    await plugin.ensureProjectSelected();

    expect(plugin.settings.projectId).toBe('inbox-1');
  });

  it('leaves a project the user already chose alone', async () => {
    const { plugin } = pluginWithProjects([INBOX]);
    plugin.settings = settingsWith({ projectId: 'p1', projectName: 'Errands' });

    await plugin.ensureProjectSelected();

    expect(plugin.settings.projectName).toBe('Errands');
  });

  it('leaves the field empty rather than failing when the list cannot be fetched', async () => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith();
    (plugin as unknown as { provider: { listProjects: () => Promise<never> } }).provider = {
      listProjects: () => Promise.reject(new TaskProviderError('unreachable')),
    };

    await expect(plugin.ensureProjectSelected()).resolves.toBeUndefined();
    expect(plugin.settings.projectId).toBe('');
  });
});
