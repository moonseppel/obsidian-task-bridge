import * as obsidian from 'obsidian';
import { App, TFile } from 'obsidian';
import ObsidianTaskSyncPlugin from '../main';

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

function makePlugin(): PluginContext {
  const vault = fakeVault();
  const plugin = Object.create(ObsidianTaskSyncPlugin.prototype) as ObsidianTaskSyncPlugin;
  plugin.app = { vault, workspace: {} } as unknown as App;
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
      const { plugin, saveData } = makePlugin();
      plugin.settings = { relativeTaskSourceNotePath: 'Done.md' };
      await plugin.saveSettings();
      expect(saveData).toHaveBeenCalledWith({ relativeTaskSourceNotePath: 'Done.md' });
    });
  });

  describe('Source note watchers', () => {
    it('follows the configured source note when it is renamed', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md' };

      vault.trigger('rename', tfile('archive/Tasks.md'), 'Tasks.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('archive/Tasks.md');
    });

    it('ignores renames of unrelated notes', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md' };

      vault.trigger('rename', tfile('Other.md'), 'Renamed-from.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('Tasks.md');
    });

    it('clears the setting when the configured source note is deleted', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md' };

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
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md' };

      vault.trigger('delete', tfile('Tasks.md'));
      await Promise.resolve();

      expect(notice).toHaveBeenCalledWith(expect.stringContaining('Tasks.md'));
    });

    it('clears the setting when the configured source note is moved to local trash', async () => {
      const { plugin, vault } = makePlugin();
      await plugin.onload();
      plugin.settings = { relativeTaskSourceNotePath: 'Tasks.md' };

      vault.trigger('rename', tfile('.trash/Tasks.md'), 'Tasks.md');
      await Promise.resolve();

      expect(plugin.settings.relativeTaskSourceNotePath).toBe('');
    });
  });
});
