import { Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianTaskSyncSettings, ObsidianTaskSyncSettingTab } from './settings';
import { Logger } from './utils/logger';

const logger = new Logger('ObsidianTaskSync');

function isInLocalTrash(path: string): boolean {
  return path === '.trash' || path.startsWith('.trash/');
}

export default class ObsidianTaskSyncPlugin extends Plugin {
  settings: ObsidianTaskSyncSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    try {
      await this.loadSettings();
      this.addSettingTab(new ObsidianTaskSyncSettingTab(this.app, this));
      this.registerSourceNoteWatchers();

      logger.info('Obsidian Task Sync plugin loaded');
    } catch (error) {
      const userMessage = 'Failed to load Obsidian Task Sync plugin. Check console for details or contact the author with the console output.';

      logger.error('Plugin load failed', error);
      new Notice(userMessage);
    }
  }

  async onunload(): Promise<void> {
    logger.info('Obsidian Task Sync plugin unloaded');
  }

  async loadSettings(): Promise<void> {
    let stored: unknown = null;

    try {
      stored = await this.loadData();
    } catch (error) {
      logger.warn('Settings file could not be read; falling back to defaults. Corrupted file is retained until settings are re-saved.', error);
      new Notice(
        'Obsidian Task Sync: the settings file could not be read and may be corrupted. Default settings have been restored. Check your plugin settings.',
      );
    }

    this.settings = this.isStoredSettings(stored)
      ? { ...DEFAULT_SETTINGS, ...stored }
      : { ...DEFAULT_SETTINGS };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private isStoredSettings(value: unknown): value is ObsidianTaskSyncSettings {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).relativeTaskSourceNotePath === 'string'
    );
  }

  private registerSourceNoteWatchers(): void {
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        void this.handleSourceNoteRename(file, oldPath);
      }),
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        void this.handleSourceNoteDelete(file);
      }),
    );
  }

  private async handleSourceNoteRename(file: TAbstractFile, oldPath: string): Promise<void> {
    if (!(file instanceof TFile) || oldPath !== this.settings.relativeTaskSourceNotePath) {
      return;
    }

    // Moving a note into the local trash arrives as a rename — treat it as a deletion.
    if (isInLocalTrash(file.path)) {
      await this.clearSourceNote();
      return;
    }

    this.settings.relativeTaskSourceNotePath = file.path;
    await this.saveSettings();
    logger.info('Source note moved; setting updated', { from: oldPath, to: file.path });
  }

  private async handleSourceNoteDelete(file: TAbstractFile): Promise<void> {
    if (file.path !== this.settings.relativeTaskSourceNotePath) {
      return;
    }

    await this.clearSourceNote();
  }

  /** Clear the configured source note, tell the user, and persist. */
  private async clearSourceNote(): Promise<void> {
    const previousPath = this.settings.relativeTaskSourceNotePath;
    this.settings.relativeTaskSourceNotePath = '';

    new Notice(`Obsidian Task Sync: The source note "${previousPath}" no longer exists, so it has been cleared from the plugin settings.`);
    logger.warn('Source note removed; setting cleared', { previousPath });

    await this.saveSettings();
  }
}
