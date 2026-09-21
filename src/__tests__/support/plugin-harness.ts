import { App, TFile } from 'obsidian';
import TaskBridgePlugin from '../../main';
import { DEFAULT_SETTINGS, TaskBridgeSettings } from '../../settings';
import { ProviderConnection } from '../../services/provider-connection';
import { stubProvider } from './stub-provider';
import { ProviderAccount } from '../../services/task-provider';
import { TaskProviderError, TaskProviderFailure } from '../../services/task-provider-error';

export interface FakeVault {
  on: (event: string, cb: (...args: unknown[]) => void) => { event: string };
  trigger: (event: string, ...args: unknown[]) => void;
  getAbstractFileByPath: (path: string) => TFile | null;
  existingPaths: Set<string>;
  /** Obsidian's config folder, which holds no file at all here, so no other plugin reads as enabled. */
  configDir: string;
  adapter: { exists: (path: string) => Promise<boolean>; read: (path: string) => Promise<string> };
}

export function fakeVault(): FakeVault {
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
    configDir: '.obsidian',
    adapter: { exists: async () => false, read: async () => '' },
    getAbstractFileByPath(path) {
      return existingPaths.has(path) ? tfile(path) : null;
    },
  };
}

export interface PluginContext {
  plugin: TaskBridgePlugin;
  vault: FakeVault;
  loadData: jest.SpyInstance;
  saveData: jest.SpyInstance;
  addSettingTab: jest.SpyInstance;
}

export function settingsWith(overrides: Partial<TaskBridgeSettings> = {}): TaskBridgeSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

export function rejectingWith(failure: TaskProviderFailure): () => Promise<ProviderAccount> {
  return () => Promise.reject(new TaskProviderError(failure));
}

export function makePlugin(connect = rejectingWith('not-configured')): PluginContext {
  const vault = fakeVault();
  const app = { vault, workspace: {} } as unknown as App;
  const manifest = {
    id: 'task-bridge',
    name: 'TaskBridge',
    version: '0.1.0',
    author: 'Test Author',
    minAppVersion: '0.15.0',
    description: 'Test plugin',
  };
  // Constructed rather than hand-assembled, so the plugin's own fields are wired as they are in use.
  const plugin = new TaskBridgePlugin(app, manifest);
  plugin.connection = new ProviderConnection(stubProvider({ connect }));

  const loadData = jest.spyOn(plugin, 'loadData').mockResolvedValue(null);
  const saveData = jest.spyOn(plugin, 'saveData').mockResolvedValue(undefined);
  const addSettingTab = jest.spyOn(plugin, 'addSettingTab').mockImplementation(() => undefined);
  jest.spyOn(plugin, 'registerEvent').mockImplementation(() => undefined);

  return { plugin, vault, loadData, saveData, addSettingTab };
}

export function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split('/').pop() ?? path;
  file.extension = file.name.includes('.') ? file.name.split('.').pop()! : '';
  return file;
}

