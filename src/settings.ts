import { App, PluginSettingTab, SecretComponent, Setting, TFile, normalizePath } from 'obsidian';
import type ObsidianTaskSyncPlugin from './main';
import { ConnectionStatus } from './services/provider-connection';
import { toSyncIntervalMinutes } from './utils/sync-interval';
import { ProviderProject } from './services/task-provider';
import { describeConnectionStatus } from './utils/connection-status-text';
import { ProjectSuggest } from './views/project-suggest';
import * as text from './views/settings-text';
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

const MISSING_ROW_CLASS = 'obsidian-task-sync-source-missing';
const INVALID_INPUT_CLASS = 'obsidian-task-sync-source-invalid';
const CONNECTION_FAILED_CLASS = 'obsidian-task-sync-connection-failed';

// Obsidian types the secret value as a string but sends null when the field is cleared with "x".
function toSecretName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
      .setName(text.SOURCE_NOTE_DISPLAY_NAME)
      .setDesc(text.SOURCE_NOTE_DESC)
      .addSearch((search) => {
        this.sourceInputEl = search.inputEl;
        new SourceNoteSuggest(this.app, search.inputEl, (path) => {
          void this.handleSourceNoteSelection(path);
        });
        search
          .setPlaceholder(text.SOURCE_NOTE_PLACEHOLDER)
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
    const path = this.plugin.settings.relativeTaskSourceNotePath;

    this.sourceSetting.setDesc(missing ? text.missingNoteWarning(path) : text.SOURCE_NOTE_DESC);
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
      .setName(text.API_TOKEN_DISPLAY_NAME)
      .setDesc(text.describeApiTokenSetting())
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
      .setName(text.CONNECTION_DISPLAY_NAME)
      .setDesc(describeConnectionStatus(this.connectionStatus, this.plugin.connection.providerName))
      .addButton((button) =>
        button
          .setButtonText(text.TEST_CONNECTION_LABEL)
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
      .setName(text.PROJECT_DISPLAY_NAME)
      .setDesc(text.PROJECT_DESC)
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
          .setPlaceholder(text.PROJECT_PLACEHOLDER)
          .setValue(this.plugin.settings.todoistProjectName);
      });
  }

  private displaySyncSettings(): void {
    new Setting(this.containerEl).setName(text.SYNC_DISPLAY_NAME).setHeading();
    new Setting(this.containerEl)
      .setName(text.SYNC_INTERVAL_DISPLAY_NAME)
      .setDesc(text.SYNC_INTERVAL_DESC)
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
      .setName(text.DEBUG_DISPLAY_NAME)
      .setDesc(text.DEBUG_DESC)
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
      return text.CONNECTION_BUSY;
    }

    return this.plugin.settings.todoistApiTokenSecretName.length === 0
      ? text.TOKEN_NEEDED_FIRST
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
