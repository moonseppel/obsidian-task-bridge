import { App, PluginSettingTab, SecretComponent, Setting, TFile, normalizePath } from 'obsidian';
import type ObsidianTaskSyncPlugin from './main';
import { ConnectionStatus } from './services/provider-connection';
import { describeConnectionStatus } from './utils/connection-status-text';
import { SourceNoteSuggest } from './views/source-note-suggest';

export interface ObsidianTaskSyncSettings {
  relativeTaskSourceNotePath: string;
  todoistApiTokenSecretName: string;
}

export const DEFAULT_SETTINGS: ObsidianTaskSyncSettings = {
  relativeTaskSourceNotePath: '',
  todoistApiTokenSecretName: '',
};

const SOURCE_NOTE_DISPLAY_NAME = 'Task source note';
const SOURCE_NOTE_DESC = 'The single note whose tasks are synced. Leave empty to sync no tasks.';
const API_TOKEN_DISPLAY_NAME = 'API token';
const API_TOKEN_DESC =
  'Kept in Obsidian’s secret storage, not in the plugin settings file. ' +
  'Create a token in Todoist under Settings → Integrations → Developer.';
const CONNECTION_DISPLAY_NAME = 'Connection';
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


  constructor(app: App, plugin: ObsidianTaskSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();
    this.displaySourceNoteSetting();
    this.displayTodoistSettings();
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
  }

  private displayApiTokenSetting(): void {
    new Setting(this.containerEl)
      .setName(API_TOKEN_DISPLAY_NAME)
      .setDesc(API_TOKEN_DESC)
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(this.plugin.settings.todoistApiTokenSecretName)
          .onChange((secretName: unknown) => {
            void this.handleApiTokenSecretChange(secretName);
          }),
      );
  }

  private displayConnectionSetting(): void {
    this.connectionSetting = new Setting(this.containerEl)
      .setName(CONNECTION_DISPLAY_NAME)
      .setDesc(describeConnectionStatus(this.connectionStatus, this.plugin.connection.providerName))
      .addButton((button) =>
        button
          .setButtonText('Test connection')
          .setDisabled(this.connectionStatus.state === 'connecting')
          .onClick(() => {
            void this.handleTestConnection();
          }),
      );

    this.connectionSetting.settingEl.toggleClass(CONNECTION_FAILED_CLASS, this.connectionStatus.state === 'failed');
  }

  private get connectionStatus(): ConnectionStatus {
    return this.plugin.connection.status;
  }

  private async handleApiTokenSecretChange(secretName: unknown): Promise<void> {
    this.plugin.settings.todoistApiTokenSecretName = toSecretName(secretName);
    await this.plugin.saveSettings();
    await this.plugin.connectToTaskProvider();
    this.display();
  }

  private async handleTestConnection(): Promise<void> {
    const attempt = this.plugin.connectToTaskProvider();
    this.display();

    await attempt;
    this.display();
  }
}
