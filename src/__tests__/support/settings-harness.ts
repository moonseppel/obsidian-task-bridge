import { App, Setting, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, TaskBridgeSettingTab } from '../../settings';
import { TodoistCredentials } from '../../services/todoist/todoist-credentials';
import { TodoistStateMapping } from '../../services/todoist/todoist-state-mapping';
import type TaskBridgePlugin from '../../main';
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
  tab: TaskBridgeSettingTab;
  plugin: TaskBridgePlugin;
  saveSettings: jest.Mock;
  connectToTaskProvider: jest.Mock;
  restartSyncSchedule: jest.Mock;
  applyDebugMode: jest.Mock;
  refreshKnownProjects: jest.Mock;
  ensureProjectSelected: jest.Mock;
  knownProjects: ProviderProject[];
  credentials: TodoistCredentials;
  stateMapping: TodoistStateMapping;
  /** Resolves to no setup, as for a vault without the Tasks plugin, unless a test says otherwise. */
  readTasksPlugin: jest.Mock;
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
  const stateMapping = new TodoistStateMapping(() => saveSettings());
  const readTasksPlugin = jest.fn().mockResolvedValue(undefined);
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
    stateMapping,
    tasksPlugin: { read: readTasksPlugin },
  } as unknown as TaskBridgePlugin;

  return {
    tab: new TaskBridgeSettingTab(app, plugin),
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
    stateMapping,
    readTasksPlugin,
  };
}

export function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function spySettingNames(): () => string[] {
  const spy = jest.spyOn(Setting.prototype, 'setName');
  return () => spy.mock.calls.map((call) => String(call[0]));
}

interface SettingInternals {
  description: string;
  settingEl: TestEl;
}

interface SourceScopeInternals {
  locationSetting: SettingInternals;
  locationInputEl: TestEl;
  ignoreSetting: SettingInternals;
  isSourceLocationMissing(): boolean;
  saveIgnorePatterns(value: string): Promise<void>;
}

interface ProviderInternals {
  connectionSetting: SettingInternals;
  reconnect(): Promise<void>;
  handleTestConnection(): Promise<void>;
  handleProjectSelection(project: { id: string; name: string }): Promise<void>;
}

function sourceScopeOf(tab: TaskBridgeSettingTab): SourceScopeInternals {
  return (tab as unknown as { sourceScope: SourceScopeInternals }).sourceScope;
}

function providerSettingsOf(tab: TaskBridgeSettingTab): ProviderInternals {
  return (tab as unknown as { providerSettings: ProviderInternals }).providerSettings;
}

export function locationDesc(tab: TaskBridgeSettingTab): string {
  return sourceScopeOf(tab).locationSetting.description;
}

export function isSourceLocationMissing(tab: TaskBridgeSettingTab): boolean {
  return sourceScopeOf(tab).isSourceLocationMissing();
}

export function settingRow(tab: TaskBridgeSettingTab): TestEl {
  return sourceScopeOf(tab).locationSetting.settingEl;
}

export function locationInput(tab: TaskBridgeSettingTab): TestEl {
  return sourceScopeOf(tab).locationInputEl;
}

export function ignoreDesc(tab: TaskBridgeSettingTab): string {
  return sourceScopeOf(tab).ignoreSetting.description;
}

export function ignoreRow(tab: TaskBridgeSettingTab): TestEl {
  return sourceScopeOf(tab).ignoreSetting.settingEl;
}

export function saveIgnorePatterns(tab: TaskBridgeSettingTab, value: string): Promise<void> {
  return sourceScopeOf(tab).saveIgnorePatterns(value);
}

export function connectionDesc(tab: TaskBridgeSettingTab): string {
  return providerSettingsOf(tab).connectionSetting.description;
}

export function connectionRow(tab: TaskBridgeSettingTab): TestEl {
  return providerSettingsOf(tab).connectionSetting.settingEl;
}

export function reconnect(tab: TaskBridgeSettingTab): Promise<void> {
  return providerSettingsOf(tab).reconnect();
}

export function testConnection(tab: TaskBridgeSettingTab): Promise<void> {
  return providerSettingsOf(tab).handleTestConnection();
}

export function selectProject(tab: TaskBridgeSettingTab, project: { id: string; name: string }): Promise<void> {
  return providerSettingsOf(tab).handleProjectSelection(project);
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
