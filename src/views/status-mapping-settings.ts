import { Setting } from 'obsidian';
import type TaskBridgePlugin from '../main';
import { UserStatus } from '../services/user-status';
import * as text from './settings-text';

/** Which provider state each Tasks plugin status syncs as, shown only while the Tasks plugin is enabled. */
export class StatusMappingSettings {
  private readonly plugin: TaskBridgePlugin;
  private readonly redraw: () => void;
  /** Nothing while the Tasks plugin is not enabled. */
  private statuses: readonly UserStatus[] | undefined;

  constructor(plugin: TaskBridgePlugin, redraw: () => void) {
    this.plugin = plugin;
    this.redraw = redraw;
  }

  /** Read when the settings open, so a status just added in the Tasks plugin is offered at once. */
  async refresh(): Promise<void> {
    this.statuses = (await this.plugin.tasksPlugin.read())?.statuses;
    this.redraw();
  }

  display(containerEl: HTMLElement): void {
    if (this.statuses === undefined) {
      return;
    }

    new Setting(containerEl)
      .setName(text.STATUS_MAPPING_DISPLAY_NAME)
      .setDesc(text.statusMappingDescription(this.plugin.connection.providerName))
      .setHeading();
    this.plugin.stateMapping.display(containerEl, this.statuses);
  }
}
