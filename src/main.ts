import { Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianTaskSyncSettings, ObsidianTaskSyncSettingTab } from './settings';
import { ConnectionStatus, ProviderConnection } from './services/provider-connection';
import { isTransientFailure } from './services/task-provider-error';
import { createTodoistProvider } from './services/todoist/todoist-provider';
import { Logger } from './utils/logger';
import { isRecord } from './utils/type-guards';

const logger = new Logger('ObsidianTaskSync');
const NOTICE_UNTIL_DISMISSED = 0;
const LOAD_FAILED_NOTICE =
  'Failed to load Obsidian Task Sync plugin. ' +
  'Check console for details or contact the author with the console output.';
const UNREADABLE_SETTINGS_LOG =
  'Settings file could not be read; falling back to defaults. ' +
  'Corrupted file is retained until settings are re-saved.';
const UNREADABLE_SETTINGS_NOTICE =
  'Obsidian Task Sync: the settings file could not be read and may be corrupted. ' +
  'Default settings have been restored. Check your plugin settings.';

function isInLocalTrash(path: string): boolean {
  return path === '.trash' || path.startsWith('.trash/');
}

export default class ObsidianTaskSyncPlugin extends Plugin {
  settings: ObsidianTaskSyncSettings = { ...DEFAULT_SETTINGS };
  connection = new ProviderConnection(
    createTodoistProvider(this.app, () => this.settings.todoistApiTokenSecretName),
  );

  async onload(): Promise<void> {
    try {
      await this.loadSettings();
      this.addSettingTab(new ObsidianTaskSyncSettingTab(this.app, this));
      this.registerSourceNoteWatchers();
      void this.connectToTaskProvider();

      logger.info('Obsidian Task Sync plugin loaded');
    } catch (error) {
      logger.error('Plugin load failed', error);
      new Notice(LOAD_FAILED_NOTICE);
    }
  }

  async onunload(): Promise<void> {
    logger.info('Obsidian Task Sync plugin unloaded');
  }

  async connectToTaskProvider(): Promise<void> {
    this.reportConnectionStatus(await this.connection.connect());
  }

  async loadSettings(): Promise<void> {
    let stored: unknown = null;

    try {
      stored = await this.loadData();
    } catch (error) {
      logger.warn(UNREADABLE_SETTINGS_LOG, error);
      new Notice(UNREADABLE_SETTINGS_NOTICE);
    }

    this.settings = toSettings(stored);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private reportConnectionStatus(status: ConnectionStatus): void {
    if (status.state !== 'failed') {
      logger.info('Task provider connection status', status.state);
      return;
    }

    logger.error('Task provider connection failed', status.message);

    if (isTransientFailure(status.failure)) {
      return;
    }

    new Notice(`Obsidian Task Sync: ${status.message}`, NOTICE_UNTIL_DISMISSED);
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

  private async clearSourceNote(): Promise<void> {
    const previousPath = this.settings.relativeTaskSourceNotePath;
    this.settings.relativeTaskSourceNotePath = '';

    new Notice(
      `Obsidian Task Sync: The source note "${previousPath}" no longer exists, ` +
        'so it has been cleared from the plugin settings.',
    );
    logger.warn('Source note removed; setting cleared', { previousPath });

    await this.saveSettings();
  }
}

function toSettings(stored: unknown): ObsidianTaskSyncSettings {
  const record = isRecord(stored) ? stored : {};

  return {
    relativeTaskSourceNotePath: readText(
      record.relativeTaskSourceNotePath,
      DEFAULT_SETTINGS.relativeTaskSourceNotePath,
    ),
    todoistApiTokenSecretName: readText(
      record.todoistApiTokenSecretName,
      DEFAULT_SETTINGS.todoistApiTokenSecretName,
    ),
  };
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
