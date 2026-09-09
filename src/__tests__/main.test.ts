import * as obsidian from 'obsidian';
import { App, TFile } from 'obsidian';
import ObsidianTaskSyncPlugin from '../main';
import { ProviderConnection } from '../services/provider-connection';
import { ProviderAccount, TaskProvider } from '../services/task-provider';
import { TaskProviderError, TaskProviderFailure } from '../services/task-provider-error';

interface FakeVault {
  on: (event: string, cb: (...args: unknown[]) => void) => { event: string };
  trigger: (event: string, ...args: unknown[]) => void;
}

function fakeVault(): FakeVault {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    on(event, cb) {
      (handlers[event] ??= []).push(cb);
      return { event };
    },
    trigger(event, ...args) {
      (handlers[event] ?? []).forEach((cb) => cb(...args));
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

function stubProvider(connect: () => Promise<ProviderAccount>): TaskProvider {
  return { displayName: 'Todoist', connect };
}

function rejectingWith(failure: TaskProviderFailure): () => Promise<ProviderAccount> {
  return () => Promise.reject(new TaskProviderError(failure));
}

function makePlugin(connect = rejectingWith('not-configured')): PluginContext {
  const vault = fakeVault();
  const plugin = Object.create(ObsidianTaskSyncPlugin.prototype) as ObsidianTaskSyncPlugin;
  plugin.app = { vault, workspace: {} } as unknown as App;
  plugin.connection = new ProviderConnection(stubProvider(connect));
  plugin.manifest = {
    id: 'obsidian-task-sync',
    name: 'Obsidian Task Sync',
    version: '0.1.0',
    author: 'Test Author',
    minAppVersion: '0.15.0',
    description: 'Test plugin',
  };

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
      const settings = { relativeTaskSourceNotePath: 'Done.md', todoistApiTokenSecretName: 'todoist-token' };
      const { plugin, saveData } = makePlugin();
      plugin.settings = settings;
      await plugin.saveSettings();
      expect(saveData).toHaveBeenCalledWith(settings);
    });

    it('loads the persisted token secret name', async () => {
      const { plugin, loadData } = makePlugin();
      loadData.mockResolvedValue({ todoistApiTokenSecretName: 'todoist-token' });
      await plugin.loadSettings();
      expect(plugin.settings.todoistApiTokenSecretName).toBe('todoist-token');
    });

    it('falls back to the default when the persisted token secret name is not text', async () => {
      const { plugin, loadData } = makePlugin();
      loadData.mockResolvedValue({ todoistApiTokenSecretName: 42 });
      await plugin.loadSettings();
      expect(plugin.settings.todoistApiTokenSecretName).toBe('');
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
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md', todoistApiTokenSecretName: '' };

      vault.trigger('rename', tfile('archive/Tasks.md'), 'Tasks.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('archive/Tasks.md');
    });

    it('ignores renames of unrelated notes', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md', todoistApiTokenSecretName: '' };

      vault.trigger('rename', tfile('Other.md'), 'Renamed-from.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('Tasks.md');
    });

    it('clears the setting when the configured source note is deleted', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md', todoistApiTokenSecretName: '' };

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
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md', todoistApiTokenSecretName: '' };

      vault.trigger('delete', tfile('Tasks.md'));
      await Promise.resolve();

      expect(notice).toHaveBeenCalledWith(expect.stringContaining('Tasks.md'));
    });

    it('clears the setting when the configured source note is moved to local trash', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md', todoistApiTokenSecretName: '' };

      vault.trigger('rename', tfile('.trash/Tasks.md'), 'Tasks.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('');
    });
  });
});
