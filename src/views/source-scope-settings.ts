import { App, SearchComponent, Setting, TFile, TFolder, normalizePath } from 'obsidian';
import type ObsidianTaskSyncPlugin from '../main';
import { matchesIgnorePattern } from '../utils/ignore-pattern';
import * as text from './settings-text';
import { SourceLocationSuggest } from './source-location-suggest';
import { TagSuggest } from './tag-suggest';

const MISSING_ROW_CLASS = 'obsidian-task-sync-source-missing';
const INVALID_INPUT_CLASS = 'obsidian-task-sync-source-invalid';
const IGNORE_INEFFECTIVE_CLASS = 'obsidian-task-sync-ignore-ineffective';

/** The rows deciding which tasks are synced: the whole vault or a note or folder, a tag, and ignore patterns. */
export class SourceScopeSettings {
  private readonly app: App;
  private readonly plugin: ObsidianTaskSyncPlugin;
  private readonly redraw: () => void;
  private locationSetting?: Setting;
  private locationInputEl?: HTMLInputElement;
  private ignoreSetting?: Setting;

  constructor(app: App, plugin: ObsidianTaskSyncPlugin, redraw: () => void) {
    this.app = app;
    this.plugin = plugin;
    this.redraw = redraw;
  }

  display(containerEl: HTMLElement): void {
    this.displayWholeVaultSetting(containerEl);
    this.displaySourceLocationSetting(containerEl);
    this.displaySourceTagSetting(containerEl);
    this.displayIgnorePatternsSetting(containerEl);
  }

  private displayWholeVaultSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
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
    this.redraw();
  }

  private displaySourceLocationSetting(containerEl: HTMLElement): void {
    const disabled = this.plugin.settings.syncWholeVault;

    this.locationSetting = new Setting(containerEl)
      .setName(text.SOURCE_LOCATION_DISPLAY_NAME)
      .setDesc(disabled ? text.SOURCE_LOCATION_DISABLED_DESC : text.SOURCE_LOCATION_DESC)
      .addSearch((search) => this.configureLocationSearch(search));

    this.displayWarningOnMissingLocation();
  }

  private configureLocationSearch(search: SearchComponent): void {
    this.locationInputEl = search.inputEl;
    new SourceLocationSuggest(this.app, search.inputEl, (path) => {
      void this.handleSourceLocationSelection(path);
    });
    search
      .setPlaceholder(text.SOURCE_LOCATION_PLACEHOLDER)
      .setValue(this.plugin.settings.relativeTaskSourcePath)
      .setDisabled(this.plugin.settings.syncWholeVault)
      .onChange((value) => {
        void this.saveSourceLocationPath(value);
      });
    // Attached to the input itself, which every redraw rebuilds, so the listener never outlives it.
    search.inputEl.addEventListener('blur', () => this.displayWarningOnMissingLocation());
  }

  private async handleSourceLocationSelection(path: string): Promise<void> {
    await this.saveSourceLocationPath(path);
    this.redraw();
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
    if (this.locationSetting === undefined || this.plugin.settings.syncWholeVault) {
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

  private displaySourceTagSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
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
    this.redraw();
  }

  private async saveSourceTag(rawTag: string): Promise<void> {
    const nextTag = rawTag.trim().replace(/^#/, '');

    if (nextTag === this.plugin.settings.sourceTag) {
      return;
    }

    this.plugin.settings.sourceTag = nextTag;
    await this.plugin.saveSettings();
  }

  private displayIgnorePatternsSetting(containerEl: HTMLElement): void {
    this.ignoreSetting = new Setting(containerEl)
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
    if (this.ignoreSetting === undefined) {
      return;
    }

    const ineffective = this.isIgnorePatternIneffective();
    const warning = ineffective ? ` ${text.IGNORE_PATTERNS_INEFFECTIVE_WARNING}` : '';

    this.ignoreSetting.setDesc(`${text.IGNORE_PATTERNS_DESC}${warning}`);
    this.ignoreSetting.settingEl.toggleClass(IGNORE_INEFFECTIVE_CLASS, ineffective);
  }

  private isIgnorePatternIneffective(): boolean {
    const note = this.selectedSourceNote();

    if (note === undefined || this.plugin.settings.ignoreFilePatterns.trim().length === 0) {
      return false;
    }

    return matchesIgnorePattern(note.name, this.plugin.settings.ignoreFilePatterns);
  }

  /** The selected single note, when the field names one that actually exists as a file. */
  private selectedSourceNote(): TFile | undefined {
    if (this.plugin.settings.syncWholeVault) {
      return undefined;
    }

    const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.relativeTaskSourcePath);
    return file instanceof TFile ? file : undefined;
  }
}
