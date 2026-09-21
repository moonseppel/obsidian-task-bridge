import { App, PluginSettingTab, Setting } from 'obsidian';
import type TaskBridgePlugin from './main';
import { toSyncIntervalMinutes } from './utils/sync-interval';
import { ProviderSettings } from './views/provider-settings';
import * as text from './views/settings-text';
import { SourceScopeSettings } from './views/source-scope-settings';
import { StatusMappingSettings } from './views/status-mapping-settings';

export interface TaskBridgeSettings {
  relativeTaskSourcePath: string;
  syncWholeVault: boolean;
  sourceTag: string;
  ignoreFilePatterns: string;
  projectId: string;
  projectName: string;
  syncIntervalMinutes: number;
  debugMode: boolean;
  /** Epoch ms of the last "fix this on this device" reminder Notice; 0 means never reminded. */
  lastCredentialReminderAt: number;
}

export const DEFAULT_SETTINGS: TaskBridgeSettings = {
  relativeTaskSourcePath: '',
  syncWholeVault: false,
  sourceTag: '',
  ignoreFilePatterns: '',
  projectId: '',
  projectName: '',
  syncIntervalMinutes: 5,
  debugMode: false,
  lastCredentialReminderAt: 0,
};

export class TaskBridgeSettingTab extends PluginSettingTab {
  private readonly plugin: TaskBridgePlugin;
  private readonly sourceScope: SourceScopeSettings;
  private readonly providerSettings: ProviderSettings;
  private readonly statusMapping: StatusMappingSettings;
  private isOpen = false;

  constructor(app: App, plugin: TaskBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.sourceScope = new SourceScopeSettings(app, plugin, () => this.display());
    this.providerSettings = new ProviderSettings(app, plugin, () => this.display());
    this.statusMapping = new StatusMappingSettings(plugin, () => this.display());
  }

  display(): void {
    // Opening the settings is one of the three moments the project list is refreshed.
    if (!this.isOpen) {
      this.isOpen = true;
      void this.refreshProjects();
      void this.statusMapping.refresh();
    }

    this.containerEl.empty();
    this.sourceScope.display(this.containerEl);
    this.providerSettings.display(this.containerEl);
    this.statusMapping.display(this.containerEl);
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

  private async saveSyncInterval(value: string): Promise<void> {
    const minutes = toSyncIntervalMinutes(value, this.plugin.settings.syncIntervalMinutes);

    if (minutes === this.plugin.settings.syncIntervalMinutes) {
      return;
    }

    this.plugin.settings.syncIntervalMinutes = minutes;
    await this.plugin.saveSettings();
    this.plugin.restartSyncSchedule();
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
}
