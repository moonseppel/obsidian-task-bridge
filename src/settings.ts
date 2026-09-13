import { App, PluginSettingTab, Setting, TFile, TFolder, normalizePath } from 'obsidian';
import type ObsidianTaskSyncPlugin from './main';
import { ConnectionStatus } from './services/provider-connection';
import { toSyncIntervalMinutes } from './utils/sync-interval';
import { matchesIgnorePattern } from './utils/ignore-pattern';
import { ProviderProject } from './services/task-provider';
import { describeConnectionStatus } from './utils/connection-status-text';
import { ProjectSuggest } from './views/project-suggest';
import * as text from './views/settings-text';
import { SourceLocationSuggest } from './views/source-location-suggest';
import { TagSuggest } from './views/tag-suggest';

export interface ObsidianTaskSyncSettings {
  relativeTaskSourcePath: string;
  syncWholeVault: boolean;
  sourceTag: string;
  ignoreFilePatterns: string;
  projectId: string;
  projectName: string;
  syncIntervalMinutes: number;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: ObsidianTaskSyncSettings = {
  relativeTaskSourcePath: '',
  syncWholeVault: false,
  sourceTag: '',
  ignoreFilePatterns: '',
  projectId: '',
  projectName: '',
  syncIntervalMinutes: 5,
  debugMode: false,
};

const MISSING_ROW_CLASS = 'obsidian-task-sync-source-missing';
const INVALID_INPUT_CLASS = 'obsidian-task-sync-source-invalid';
const IGNORE_INEFFECTIVE_CLASS = 'obsidian-task-sync-ignore-ineffective';
const CONNECTION_FAILED_CLASS = 'obsidian-task-sync-connection-failed';

export class ObsidianTaskSyncSettingTab extends PluginSettingTab {
  private readonly plugin: ObsidianTaskSyncPlugin;
  private locationSetting: Setting | null = null;
  private locationInputEl: HTMLInputElement | null = null;
  private ignoreSetting: Setting | null = null;
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
    this.displayWholeVaultSetting();
    this.displaySourceLocationSetting();
    this.displaySourceTagSetting();
    this.displayIgnorePatternsSetting();
    this.displayProviderSettings();
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

  private displayWholeVaultSetting(): void {
    new Setting(this.containerEl)
      .setName(text.WHOLE_VAULT_DISPLAY_NAME)
      .setDesc(text.WHOLE_VAULT_DESC)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncWholeVault).onChange((enabled) => {
          void this.saveWholeVault(enabled);
        }),
      );
  }

  private async saveWholeVault(enabled: boolean): Promise<void> {
    this.plugin.settings.syncWholeVault = enabled;
    await this.plugin.saveSettings();
    this.display();
  }

  private displaySourceLocationSetting(): void {
    const disabled = this.plugin.settings.syncWholeVault;

    this.locationSetting = new Setting(this.containerEl)
      .setName(text.SOURCE_LOCATION_DISPLAY_NAME)
      .setDesc(disabled ? text.SOURCE_LOCATION_DISABLED_DESC : text.SOURCE_LOCATION_DESC)
      .addSearch((search) => {
        this.locationInputEl = search.inputEl;
        new SourceLocationSuggest(this.app, search.inputEl, (path) => {
          void this.handleSourceLocationSelection(path);
        });
        search
          .setPlaceholder(text.SOURCE_LOCATION_PLACEHOLDER)
          .setValue(this.plugin.settings.relativeTaskSourcePath)
          .setDisabled(disabled)
          .onChange((value) => {
            void this.saveSourceLocationPath(value);
          });
        search.inputEl.addEventListener('blur', () => {
          this.displayWarningOnMissingLocation();
        });
      });

    this.displayWarningOnMissingLocation();
  }

  private async handleSourceLocationSelection(path: string): Promise<void> {
    await this.saveSourceLocationPath(path);
    this.display();
  }

  private async saveSourceLocationPath(rawPath: string): Promise<void> {
    const trimmed = rawPath.trim();
    const nextPath = trimmed.length > 0 ? normalizePath(trimmed) : '';

    if (nextPath === this.plugin.settings.relativeTaskSourcePath) {
      return;
    }

    this.plugin.settings.relativeTaskSourcePath = nextPath;
    await this.plugin.saveSettings();
  }

  private displayWarningOnMissingLocation(): void {
    if (this.locationSetting === null || this.plugin.settings.syncWholeVault) {
      return;
    }

    const missing = this.isSourceLocationMissing();
    const path = this.plugin.settings.relativeTaskSourcePath;

    this.locationSetting.setDesc(missing ? text.missingLocationWarning(path) : text.SOURCE_LOCATION_DESC);
    this.locationSetting.settingEl.toggleClass(MISSING_ROW_CLASS, missing);
    this.locationInputEl?.toggleClass(INVALID_INPUT_CLASS, missing);
  }

  private isSourceLocationMissing(): boolean {
    const path = this.plugin.settings.relativeTaskSourcePath;

    if (path.length === 0) {
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    return !(file instanceof TFile) && !(file instanceof TFolder);
  }

  /** The selected single note, when the field names one that actually exists as a file. */
  private get selectedSourceNote(): TFile | null {
    if (this.plugin.settings.syncWholeVault) {
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.relativeTaskSourcePath);
    return file instanceof TFile ? file : null;
  }

  private displaySourceTagSetting(): void {
    new Setting(this.containerEl)
      .setName(text.SOURCE_TAG_DISPLAY_NAME)
      .setDesc(text.SOURCE_TAG_DESC)
      .addSearch((search) => {
        new TagSuggest(this.app, search.inputEl, (tag) => {
          void this.handleSourceTagSelection(tag);
        });
        search
          .setPlaceholder(text.SOURCE_TAG_PLACEHOLDER)
          .setValue(this.plugin.settings.sourceTag)
          .onChange((value) => {
            void this.saveSourceTag(value);
          });
      });
  }

  private async handleSourceTagSelection(tag: string): Promise<void> {
    await this.saveSourceTag(tag);
    this.display();
  }

  private async saveSourceTag(rawTag: string): Promise<void> {
    const nextTag = rawTag.trim().replace(/^#/, '');

    if (nextTag === this.plugin.settings.sourceTag) {
      return;
    }

    this.plugin.settings.sourceTag = nextTag;
    await this.plugin.saveSettings();
  }

  private displayIgnorePatternsSetting(): void {
    this.ignoreSetting = new Setting(this.containerEl)
      .setName(text.IGNORE_PATTERNS_DISPLAY_NAME)
      .addText((input) =>
        input
          .setPlaceholder(text.IGNORE_PATTERNS_PLACEHOLDER)
          .setValue(this.plugin.settings.ignoreFilePatterns)
          .onChange((value) => {
            void this.saveIgnorePatterns(value);
          }),
      );

    this.displayIgnorePatternsWarning();
  }

  private async saveIgnorePatterns(rawPatterns: string): Promise<void> {
    if (rawPatterns === this.plugin.settings.ignoreFilePatterns) {
      return;
    }

    this.plugin.settings.ignoreFilePatterns = rawPatterns;
    await this.plugin.saveSettings();
    this.displayIgnorePatternsWarning();
  }

  /** An ignore pattern never excludes a note the user explicitly picked as the single source. */
  private displayIgnorePatternsWarning(): void {
    if (this.ignoreSetting === null) {
      return;
    }

    const ineffective = this.isIgnorePatternIneffective();

    this.ignoreSetting.setDesc(
      ineffective
        ? `${text.IGNORE_PATTERNS_DESC} ${text.ignorePatternIneffectiveWarning()}`
        : text.IGNORE_PATTERNS_DESC,
    );
    this.ignoreSetting.settingEl.toggleClass(IGNORE_INEFFECTIVE_CLASS, ineffective);
  }

  private isIgnorePatternIneffective(): boolean {
    const note = this.selectedSourceNote;

    if (note === null || this.plugin.settings.ignoreFilePatterns.trim().length === 0) {
      return false;
    }

    return matchesIgnorePattern(note.name, this.plugin.settings.ignoreFilePatterns);
  }

  private displayProviderSettings(): void {
    new Setting(this.containerEl).setName(this.plugin.connection.providerName).setHeading();
    this.plugin.credentials.display(this.containerEl, { onCredentialsChanged: () => this.reconnect() });
    this.displayConnectionSetting();
    this.displayProjectSetting();
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
      .setDesc(text.projectDescription(this.defaultProjectName))
      .addSearch((search) => {
        new ProjectSuggest(this.app, search.inputEl, {
          readProjects: () => this.plugin.knownProjects,
          onSelect: (project) => {
            void this.handleProjectSelection(project);
          },
        });
        // No `onChange`: picking a suggestion is the only way to change this, so it can
        // never be left empty and a sync can never stall for want of a project.
        search
          .setPlaceholder(this.defaultProjectName)
          .setValue(this.plugin.settings.projectName);
      });
  }

  private displaySyncSettings(): void {
    new Setting(this.containerEl).setName(text.SYNC_DISPLAY_NAME).setHeading();
    new Setting(this.containerEl)
      .setName(text.SYNC_INTERVAL_DISPLAY_NAME)
      .setDesc(text.syncIntervalDescription(this.plugin.connection.providerName))
      .addText((input) =>
        input
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
    this.plugin.settings.projectId = project.id;
    this.plugin.settings.projectName = project.name;
    await this.plugin.saveSettings();
    this.display();
  }

  private describeWhyTestingIsUnavailable(): string {
    if (this.connectionStatus.state === 'connecting') {
      return text.CONNECTION_BUSY;
    }

    return this.plugin.credentials.describeWhatIsMissing();
  }

  private get defaultProjectName(): string {
    return this.plugin.connection.defaultProjectName;
  }

  private get connectionStatus(): ConnectionStatus {
    return this.plugin.connection.status;
  }

  private async reconnect(): Promise<void> {
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
