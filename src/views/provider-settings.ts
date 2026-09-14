import { App, Setting } from 'obsidian';
import type TaskBridgePlugin from '../main';
import { ConnectionStatus } from '../services/provider-connection';
import { ProviderProject } from '../services/task-provider';
import { describeConnectionStatus } from '../utils/connection-status-text';
import { ProjectSuggest } from './project-suggest';
import * as text from './settings-text';

const CONNECTION_FAILED_CLASS = 'task-bridge-connection-failed';

/** The rows for the task provider: its own credentials, the connection check, and the project tasks go to. */
export class ProviderSettings {
  private readonly app: App;
  private readonly plugin: TaskBridgePlugin;
  private readonly redraw: () => void;
  private connectionSetting?: Setting;

  constructor(app: App, plugin: TaskBridgePlugin, redraw: () => void) {
    this.app = app;
    this.plugin = plugin;
    this.redraw = redraw;
  }

  display(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(this.plugin.connection.providerName).setHeading();
    this.plugin.credentials.display(containerEl, { onCredentialsChanged: () => this.reconnect() });
    this.displayConnectionSetting(containerEl);
    this.displayProjectSetting(containerEl);
  }

  private displayConnectionSetting(containerEl: HTMLElement): void {
    const unavailableReason = this.describeWhyTestingIsUnavailable();

    this.connectionSetting = new Setting(containerEl)
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

  private displayProjectSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
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
        search.setPlaceholder(this.defaultProjectName).setValue(this.plugin.settings.projectName);
      });
  }

  private async handleProjectSelection(project: ProviderProject): Promise<void> {
    this.plugin.settings.projectId = project.id;
    this.plugin.settings.projectName = project.name;
    await this.plugin.saveSettings();
    this.redraw();
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
    this.redraw();
  }

  private async handleTestConnection(): Promise<void> {
    const attempt = this.plugin.connectToTaskProvider();
    this.redraw();

    await attempt;
    await this.plugin.refreshKnownProjects();
    await this.plugin.ensureProjectSelected();
    this.redraw();
  }
}
