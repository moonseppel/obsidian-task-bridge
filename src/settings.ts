import { App, PluginSettingTab, Setting, TFile, normalizePath } from 'obsidian';
import type ObsidianTaskSyncPlugin from './main';
import { SourceNoteSuggest } from './views/source-note-suggest';

export interface ObsidianTaskSyncSettings {
  relativeTaskSourceNotePath: string;
}

export const DEFAULT_SETTINGS: ObsidianTaskSyncSettings = {
  relativeTaskSourceNotePath: '',
};

const SOURCE_NOTE_DESC = 'The single note whose tasks are synced. Leave empty to sync no tasks.';
const MISSING_ROW_CLASS = 'obsidian-task-sync-source-missing';
const INVALID_INPUT_CLASS = 'obsidian-task-sync-source-invalid';
const SOURCE_NOTE_DISPLAY_NAME = 'Task source note';

export class ObsidianTaskSyncSettingTab extends PluginSettingTab {
  private readonly plugin: ObsidianTaskSyncPlugin;
  private sourceSetting: Setting | null = null;
  private sourceInputEl: HTMLInputElement | null = null;

  constructor(app: App, plugin: ObsidianTaskSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

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
    const message = `Note not found at "${this.plugin.settings.relativeTaskSourceNotePath}" — pick an existing note or clear the field.`;

    this.sourceSetting.setDesc(missing ? message : SOURCE_NOTE_DESC);
    this.sourceSetting.settingEl.toggleClass(MISSING_ROW_CLASS, missing);
    this.sourceInputEl?.toggleClass(INVALID_INPUT_CLASS, missing);
  }

  private isSourceNoteMissing(): boolean {
    const path = this.plugin.settings.relativeTaskSourceNotePath;
    return path.length > 0 && !(this.app.vault.getAbstractFileByPath(path) instanceof TFile);
  }
}
