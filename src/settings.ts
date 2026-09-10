import { App, PluginSettingTab, SecretComponent, Setting, TFile, normalizePath } from 'obsidian';
import type ObsidianTaskSyncPlugin from './main';
import { ConnectionStatus } from './services/provider-connection';
import { ProviderProject } from './services/task-provider';
import { describeConnectionStatus } from './utils/connection-status-text';
import { ProjectSuggest } from './views/project-suggest';
import { SourceNoteSuggest } from './views/source-note-suggest';

export interface ObsidianTaskSyncSettings {
  relativeTaskSourceNotePath: string;
  todoistApiTokenSecretName: string;
  todoistProjectId: string;
  todoistProjectName: string;
  syncIntervalMinutes: number;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: ObsidianTaskSyncSettings = {
  relativeTaskSourceNotePath: '',
  todoistApiTokenSecretName: '',
  todoistProjectId: '',
  todoistProjectName: '',
  syncIntervalMinutes: 5,
  debugMode: false,
};

export const MIN_SYNC_INTERVAL_MINUTES = 1;
export const MAX_SYNC_INTERVAL_MINUTES = 1440;

const SOURCE_NOTE_DISPLAY_NAME = 'Task source note';
const SOURCE_NOTE_DESC = 'The single note whose tasks are synced. Leave empty to sync no tasks.';
const API_TOKEN_DISPLAY_NAME = 'API token';
const API_TOKEN_DESC_START =
  'Kept in Obsidian’s secret storage, not in the plugin settings file. ' +
  'Create a token in Todoist under Settings → Integrations → ';
const API_TOKEN_LINK_TEXT = 'Developer';
const API_TOKEN_URL = 'https://app.todoist.com/app/settings/integrations/developer';
const API_TOKEN_DESC_END =
  '. The token must be configured on every devices used separately.';
const CONNECTION_DISPLAY_NAME = 'Connection';
const PROJECT_DISPLAY_NAME = 'Project';
const PROJECT_DESC =
  'Where synced tasks are created. Defaults to the Inbox, and falls back to it if the ' +
  'chosen project is deleted.';
const SYNC_DISPLAY_NAME = 'Sync';
const SYNC_INTERVAL_DISPLAY_NAME = 'Check for changes every';
const SYNC_INTERVAL_DESC =
  `How often Todoist is polled for title changes, in minutes ` +
  `(${MIN_SYNC_INTERVAL_MINUTES}–${MAX_SYNC_INTERVAL_MINUTES}). ` +
  'Changes made in Obsidian are sent as soon as the note is saved.';
const DEBUG_DISPLAY_NAME = 'Debug mode';
const DEBUG_DESC = 'Leave this off unless you are diagnosing a problem.';
const MISSING_ROW_CLASS = 'obsidian-task-sync-source-missing';
const INVALID_INPUT_CLASS = 'obsidian-task-sync-source-invalid';
const CONNECTION_FAILED_CLASS = 'obsidian-task-sync-connection-failed';

// Obsidian types the secret value as a string but sends null when the field is cleared with "x".
function toSecretName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function toSyncIntervalMinutes(value: unknown, fallback: number): number {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  // An empty field means the user is still typing, not that they want the shortest interval.
  const parsed = text.length === 0 ? Number.NaN : Number(text);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(MAX_SYNC_INTERVAL_MINUTES, Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(parsed)));
}

function describeApiTokenSetting(): DocumentFragment {
  return createFragment((description) => {
    description.appendText(API_TOKEN_DESC_START);
    description.createEl('a', { text: API_TOKEN_LINK_TEXT, href: API_TOKEN_URL });
    description.appendText(API_TOKEN_DESC_END);
  });
}

export class ObsidianTaskSyncSettingTab extends PluginSettingTab {
  private readonly plugin: ObsidianTaskSyncPlugin;
  private sourceSetting: Setting | null = null;
  private sourceInputEl: HTMLInputElement | null = null;
  private connectionSetting: Setting | null = null;
  private isOpen = false;

  constructor(app: App, plugin: ObsidianTaskSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    // Opening the settings is one of the three moments the project list is refreshed.
    if (!this.isOpen) {
      this.isOpen = true;
      void this.refreshProjects();
    }

    this.containerEl.empty();
    this.displaySourceNoteSetting();
    this.displayTodoistSettings();
    this.displaySyncSettings();
    this.displayDebugSetting();
  }

  hide(): void {
    this.isOpen = false;
  }

  private async refreshProjects(): Promise<void> {
    await this.plugin.refreshKnownProjects();
    this.display();
  }

  private displaySourceNoteSetting(): void {
    this.sourceSetting = new Setting(this.containerEl)
      .setName(SOURCE_NOTE_DISPLAY_NAME)
      .setDesc(SOURCE_NOTE_DESC)
      .addSearch((search) => {
        this.sourceInputEl = search.inputEl;
        new SourceNoteSuggest(this.app, search.inputEl, (path) => {
          void this.handleSourceNoteSelection(path);
        });
        search
          .setPlaceholder('Example: Tasks.md')
          .setValue(this.plugin.settings.relativeTaskSourceNotePath)
          .onChange((value) => {
            void this.saveSourceNotePath(value);
          });
        search.inputEl.addEventListener('blur', () => {
          this.displayWarningOnMissingNote();
        });
      });

    this.displayWarningOnMissingNote();
  }

  private async handleSourceNoteSelection(path: string): Promise<void> {
    await this.saveSourceNotePath(path);
    this.display();
  }

  private async saveSourceNotePath(rawPath: string): Promise<void> {
    const trimmed = rawPath.trim();
    const nextPath = trimmed.length > 0 ? normalizePath(trimmed) : '';

    if (nextPath === this.plugin.settings.relativeTaskSourceNotePath) {
      return;
    }

    this.plugin.settings.relativeTaskSourceNotePath = nextPath;
    await this.plugin.saveSettings();
  }

  private displayWarningOnMissingNote(): void {
    if (this.sourceSetting === null) {
      return;
    }

    const missing = this.isSourceNoteMissing();
    const message =
      `Note not found at "${this.plugin.settings.relativeTaskSourceNotePath}" — ` +
      'pick an existing note or clear the field.';

    this.sourceSetting.setDesc(missing ? message : SOURCE_NOTE_DESC);
    this.sourceSetting.settingEl.toggleClass(MISSING_ROW_CLASS, missing);
    this.sourceInputEl?.toggleClass(INVALID_INPUT_CLASS, missing);
  }

  private isSourceNoteMissing(): boolean {
    const path = this.plugin.settings.relativeTaskSourceNotePath;
    return path.length > 0 && !(this.app.vault.getAbstractFileByPath(path) instanceof TFile);
  }

  private displayTodoistSettings(): void {
    new Setting(this.containerEl).setName(this.plugin.connection.providerName).setHeading();
    this.displayApiTokenSetting();
    this.displayConnectionSetting();
    this.displayProjectSetting();
  }

  private displayApiTokenSetting(): void {
    new Setting(this.containerEl)
      .setName(API_TOKEN_DISPLAY_NAME)
      .setDesc(describeApiTokenSetting())
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(this.plugin.settings.todoistApiTokenSecretName)
          .onChange((secretName: unknown) => {
            void this.handleApiTokenSecretChange(secretName);
          }),
      );
  }

  private displayConnectionSetting(): void {
    const unavailableReason = this.describeWhyTestingIsUnavailable();

    this.connectionSetting = new Setting(this.containerEl)
      .setName(CONNECTION_DISPLAY_NAME)
      .setDesc(describeConnectionStatus(this.connectionStatus, this.plugin.connection.providerName))
      .addButton((button) =>
        button
          .setButtonText('Test connection')
          .setTooltip(unavailableReason)
          .setDisabled(unavailableReason.length > 0)
          .onClick(() => {
            void this.handleTestConnection();
          }),
      );

    this.connectionSetting.settingEl.toggleClass(CONNECTION_FAILED_CLASS, this.connectionStatus.state === 'failed');
  }

  private displayProjectSetting(): void {
    new Setting(this.containerEl)
      .setName(PROJECT_DISPLAY_NAME)
      .setDesc(PROJECT_DESC)
      .addSearch((search) => {
        new ProjectSuggest(
          this.app,
          search.inputEl,
          () => this.plugin.knownProjects,
          (project) => {
            void this.handleProjectSelection(project);
          },
        );
        // No `onChange`: picking a suggestion is the only way to change this, so it can
        // never be left empty and a sync can never stall for want of a project.
        search
          .setPlaceholder('Inbox')
          .setValue(this.plugin.settings.todoistProjectName);
      });
  }

  private displaySyncSettings(): void {
    new Setting(this.containerEl).setName(SYNC_DISPLAY_NAME).setHeading();
    new Setting(this.containerEl)
      .setName(SYNC_INTERVAL_DISPLAY_NAME)
      .setDesc(SYNC_INTERVAL_DESC)
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.syncIntervalMinutes))
          .setValue(String(this.plugin.settings.syncIntervalMinutes))
          .onChange((value) => {
            void this.saveSyncInterval(value);
          }),
      );
  }

  private displayDebugSetting(): void {
    new Setting(this.containerEl)
      .setName(DEBUG_DISPLAY_NAME)
      .setDesc(DEBUG_DESC)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debugMode)
          .onChange((enabled) => {
            void this.saveDebugMode(enabled);
          }),
      );
  }

  private async saveDebugMode(enabled: boolean): Promise<void> {
    this.plugin.settings.debugMode = enabled;
    await this.plugin.saveSettings();
    this.plugin.applyDebugMode();
  }

  private async saveSyncInterval(value: string): Promise<void> {
    const minutes = toSyncIntervalMinutes(value, this.plugin.settings.syncIntervalMinutes);

    if (minutes === this.plugin.settings.syncIntervalMinutes) {
      return;
    }

    this.plugin.settings.syncIntervalMinutes = minutes;
    await this.plugin.saveSettings();
    this.plugin.restartSyncSchedule();
  }

  private async handleProjectSelection(project: ProviderProject): Promise<void> {
    this.plugin.settings.todoistProjectId = project.id;
    this.plugin.settings.todoistProjectName = project.name;
    await this.plugin.saveSettings();
    this.display();
  }

  private describeWhyTestingIsUnavailable(): string {
    if (this.connectionStatus.state === 'connecting') {
      return 'A connection check is already running.';
    }

    return this.plugin.settings.todoistApiTokenSecretName.length === 0
      ? 'Select an API token first.'
      : '';
  }

  private get connectionStatus(): ConnectionStatus {
    return this.plugin.connection.status;
  }

  private async handleApiTokenSecretChange(secretName: unknown): Promise<void> {
    this.plugin.settings.todoistApiTokenSecretName = toSecretName(secretName);
    await this.plugin.saveSettings();
    // Refreshed first, so choosing the default below does not ask for the same list twice.
    await this.plugin.refreshKnownProjects();
    await this.plugin.connectToTaskProvider();
    await this.plugin.ensureProjectSelected();
    this.display();
  }

  private async handleTestConnection(): Promise<void> {
    const attempt = this.plugin.connectToTaskProvider();
    this.display();

    await attempt;
    await this.plugin.refreshKnownProjects();
    await this.plugin.ensureProjectSelected();
    this.display();
  }
}
