import { App, Setting, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianTaskSyncSettingTab } from '../../settings';
import { TodoistCredentials } from '../../services/todoist/todoist-credentials';
import type ObsidianTaskSyncPlugin from '../../main';
import { ProviderConnection } from '../../services/provider-connection';
import { stubProvider } from './stub-provider';
import { ProviderAccount, ProviderProject } from '../../services/task-provider';
import { TaskProviderError } from '../../services/task-provider-error';

export interface TestEl {
  hasClass(cls: string): boolean;
  dispatch(type: string): void;
}

export function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split('/').pop() ?? path;
  return file;
}

export interface TabContext {
  tab: ObsidianTaskSyncSettingTab;
  plugin: ObsidianTaskSyncPlugin;
  saveSettings: jest.Mock;
  connectToTaskProvider: jest.Mock;
  restartSyncSchedule: jest.Mock;
  applyDebugMode: jest.Mock;
  refreshKnownProjects: jest.Mock;
  ensureProjectSelected: jest.Mock;
  knownProjects: ProviderProject[];
  credentials: TodoistCredentials;
  connection: ProviderConnection;
  existingPaths: string[];
}

export function notConfigured(): Promise<ProviderAccount> {
  return Promise.reject(new TaskProviderError('not-configured'));
}

export function makeTab(
  relativeTaskSourcePath: string,
  existingPaths: string[] = [],
  connect: () => Promise<ProviderAccount> = notConfigured,
): TabContext {
  const app = {
    vault: {
      getMarkdownFiles: (): TFile[] => existingPaths.map(tfile),
      getAbstractFileByPath: (path: string): TFile | null =>
        existingPaths.includes(path) ? tfile(path) : null,
    },
  } as unknown as App;

  const saveSettings = jest.fn().mockResolvedValue(undefined);
  const connection = new ProviderConnection(stubProvider({ connect }));
  const connectToTaskProvider = jest.fn().mockImplementation(() => connection.connect());
  const restartSyncSchedule = jest.fn();
  const applyDebugMode = jest.fn();
  const credentials = new TodoistCredentials(app, () => saveSettings());
  const refreshKnownProjects = jest.fn().mockResolvedValue(undefined);
  const ensureProjectSelected = jest.fn().mockResolvedValue(undefined);
  const knownProjects: ProviderProject[] = [];
  const plugin = {
    app,
    settings: { ...DEFAULT_SETTINGS, relativeTaskSourcePath },
    saveSettings,
    connection,
    connectToTaskProvider,
    restartSyncSchedule,
    applyDebugMode,
    refreshKnownProjects,
    ensureProjectSelected,
    knownProjects,
    credentials,
  } as unknown as ObsidianTaskSyncPlugin;

  return {
    tab: new ObsidianTaskSyncSettingTab(app, plugin),
    plugin,
    saveSettings,
    connectToTaskProvider,
    connection,
    existingPaths,
    restartSyncSchedule,
    applyDebugMode,
    refreshKnownProjects,
    ensureProjectSelected,
    knownProjects,
    credentials,
  };
}

export function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function spySettingNames(): () => string[] {
  const spy = jest.spyOn(Setting.prototype, 'setName');
  return () => spy.mock.calls.map((call) => String(call[0]));
}

export function locationDesc(tab: ObsidianTaskSyncSettingTab): string {
  return (tab as unknown as { locationSetting: { description: string } }).locationSetting.description;
}

export function connectionDesc(tab: ObsidianTaskSyncSettingTab): string {
  return (tab as unknown as { connectionSetting: { description: string } }).connectionSetting.description;
}

export function isSourceLocationMissing(tab: ObsidianTaskSyncSettingTab): boolean {
  return (tab as unknown as { isSourceLocationMissing(): boolean }).isSourceLocationMissing();
}

export function settingRow(tab: ObsidianTaskSyncSettingTab): TestEl {
  return (tab as unknown as { locationSetting: { settingEl: TestEl } }).locationSetting.settingEl;
}

export function locationInput(tab: ObsidianTaskSyncSettingTab): TestEl {
  return (tab as unknown as { locationInputEl: TestEl }).locationInputEl;
}

export function ignoreDesc(tab: ObsidianTaskSyncSettingTab): string {
  return (tab as unknown as { ignoreSetting: { description: string } }).ignoreSetting.description;
}

export function ignoreRow(tab: ObsidianTaskSyncSettingTab): TestEl {
  return (tab as unknown as { ignoreSetting: { settingEl: TestEl } }).ignoreSetting.settingEl;
}

export interface TestFragment {
  textContent: string;
  links: Array<{ text: string; href: string }>;
}

export function tokenDescription(setDesc: jest.SpyInstance): TestFragment {
  const fragment = setDesc.mock.calls
    .map((call) => call[0] as unknown)
    .find((value) => typeof value !== 'string');

  return fragment as TestFragment;
}

export function connectionRow(tab: ObsidianTaskSyncSettingTab): TestEl {
  return (tab as unknown as { connectionSetting: { settingEl: TestEl } }).connectionSetting.settingEl;
}
