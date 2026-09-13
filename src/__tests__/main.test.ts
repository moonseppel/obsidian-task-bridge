import * as obsidian from 'obsidian';
import ObsidianTaskSyncPlugin from '../main';
import { TaskProviderFailure } from '../services/task-provider-error';
import { Logger } from '../utils/logger';
import {
  makePlugin,
  rejectingWith,
  settingsWith,
  tfile,
} from './support/plugin-harness';

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

    it('logs its version and platform once loaded, for bug reports', async () => {
      const info = jest.spyOn(Logger.prototype, 'info').mockImplementation();
      const { plugin } = makePlugin();

      await plugin.onload();

      expect(info).toHaveBeenCalledWith('Obsidian Task Sync plugin loaded', { version: '0.1.0', platform: 'desktop' });
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

      expect(plugin.settings.relativeTaskSourcePath).toBe('');
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
      loadData.mockResolvedValue({ relativeTaskSourcePath: 'Tasks.md' });
      await plugin.loadSettings();
      expect(plugin.settings.relativeTaskSourcePath).toBe('Tasks.md');
    });

    it('falls back to defaults when nothing is persisted', async () => {
      const { plugin } = makePlugin();
      await plugin.loadSettings();
      expect(plugin.settings.relativeTaskSourcePath).toBe('');
    });

    it('ignores malformed persisted data', async () => {
      const { plugin, loadData } = makePlugin();
      loadData.mockResolvedValue('not an object');
      await plugin.loadSettings();
      expect(plugin.settings.relativeTaskSourcePath).toBe('');
    });

    it('writes settings through saveData', async () => {
      const settings = settingsWith({ relativeTaskSourcePath: 'Done.md' });
      const { plugin, saveData } = makePlugin();
      plugin.settings = settings;
      await plugin.saveSettings();
      expect(saveData).toHaveBeenCalledWith({
        ...settings,
        taskLinks: [],
        orphanedTasks: [],
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
      plugin.settings = settingsWith({ relativeTaskSourcePath: 'Tasks.md' });

      vault.trigger('rename', tfile('archive/Tasks.md'), 'Tasks.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourcePath).toBe('archive/Tasks.md');
    });

    it('ignores renames of unrelated notes', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = settingsWith({ relativeTaskSourcePath: 'Tasks.md' });

      vault.trigger('rename', tfile('Other.md'), 'Renamed-from.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourcePath).toBe('Tasks.md');
    });

    it('clears the setting when the configured source note is deleted', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = settingsWith({ relativeTaskSourcePath: 'Tasks.md' });

      vault.trigger('delete', tfile('Tasks.md'));
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourcePath).toBe('');
    });

    it('notifies the user when the configured source note is deleted', async () => {
      const notice = jest
        .spyOn(obsidian, 'Notice')
        .mockImplementation(() => undefined as unknown as obsidian.Notice);
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = settingsWith({ relativeTaskSourcePath: 'Tasks.md' });

      vault.trigger('delete', tfile('Tasks.md'));
      await Promise.resolve();

      expect(notice).toHaveBeenCalledWith(expect.stringContaining('Tasks.md'));
    });

    it('clears the setting when the configured source note is moved to local trash', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = settingsWith({ relativeTaskSourcePath: 'Tasks.md' });

      vault.trigger('rename', tfile('.trash/Tasks.md'), 'Tasks.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourcePath).toBe('');
    });
  });
});
