import { Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  ObsidianTaskSyncSettings,
  ObsidianTaskSyncSettingTab,
  toSyncIntervalMinutes,
} from './settings';
import { ConnectionStatus, ProviderConnection } from './services/provider-connection';
import { ProviderProject, defaultProjectOf } from './services/task-provider';
import { TaskProviderError, TaskProviderFailure, isTransientFailure } from './services/task-provider-error';
import { ObsidianSourceNote } from './services/sync/obsidian-source-note';
import { TaskLinkStore } from './services/sync/task-links';
import { SyncOutcome, TitleSync } from './services/sync/title-sync';
import { createTodoistProvider } from './services/todoist/todoist-provider';
import { hideRenderedAnchors } from './views/rendered-anchor';
import { Logger, setDebugLogging } from './utils/logger';
import { isRecord } from './utils/type-guards';

const logger = new Logger('ObsidianTaskSync');
const NOTICE_UNTIL_DISMISSED = 0;
const MILLISECONDS_PER_MINUTE = 60_000;
/** Long enough that a burst of keystrokes settles into one sync. */
const SYNC_DEBOUNCE_MS = 2_000;
const LOAD_FAILED_NOTICE =
  'Failed to load Obsidian Task Sync plugin. ' +
  'Check console for details or contact the author with the console output.';
const UNREADABLE_SETTINGS_LOG =
  'Settings file could not be read; falling back to defaults. ' +
  'Corrupted file is retained until settings are re-saved.';
const UNREADABLE_SETTINGS_NOTICE =
  'Obsidian Task Sync: the settings file could not be read and may be corrupted. ' +
  'Default settings have been restored. Check your plugin settings.';
const DEBUG_BODY_CLASS = 'obsidian-task-sync-debug';
const SYNC_FAILED_MESSAGE = 'Syncing tasks failed unexpectedly. Check the console for details.';

function isInLocalTrash(path: string): boolean {
  return path === '.trash' || path.startsWith('.trash/');
}

export default class ObsidianTaskSyncPlugin extends Plugin {
  settings: ObsidianTaskSyncSettings = { ...DEFAULT_SETTINGS };
  taskLinks = new TaskLinkStore();
  /** The last project list seen, so the picker still offers choices while offline. */
  knownProjects: ProviderProject[] = [];
  private readonly provider = createTodoistProvider(
    this.app,
    () => this.settings.todoistApiTokenSecretName,
  );
  connection = new ProviderConnection(this.provider);
  private titleSync: TitleSync | null = null;
  private syncIntervalId: number | null = null;
  private pendingSyncId: number | null = null;
  private isSyncing = false;
  private noteChangedWhileSyncing = false;
  private reportedSyncFailure: TaskProviderFailure | null = null;

  async onload(): Promise<void> {
    try {
      await this.loadSettings();
      this.titleSync = this.createTitleSync();
      this.applyDebugMode();
      this.addSettingTab(new ObsidianTaskSyncSettingTab(this.app, this));
      this.registerMarkdownPostProcessor((element) => {
        if (!this.settings.debugMode) {
          hideRenderedAnchors(element);
        }
      });
      this.addCommand({ id: 'sync-now', name: 'Sync now', callback: () => void this.syncTasks() });
      this.registerSourceNoteWatchers();
      this.register(() => this.cancelPendingSync());
      this.restartSyncSchedule();
      void this.connectAndSync();

      logger.info('Obsidian Task Sync plugin loaded');
    } catch (error) {
      logger.error('Plugin load failed', error);
      new Notice(LOAD_FAILED_NOTICE);
    }
  }

  async onunload(): Promise<void> {
    document.body.removeClass(DEBUG_BODY_CLASS);
    logger.info('Obsidian Task Sync plugin unloaded');
  }

  async connectToTaskProvider(): Promise<void> {
    this.reportConnectionStatus(await this.connection.connect());
  }

  /** Debug mode reveals the anchors and opens up debug logging; both are off by default. */
  applyDebugMode(): void {
    setDebugLogging(this.settings.debugMode);
    document.body.toggleClass(DEBUG_BODY_CLASS, this.settings.debugMode);
  }

  /** Deliberately rare: only opening the settings, changing the token, or testing the connection. */
  async refreshKnownProjects(): Promise<void> {
    try {
      this.knownProjects = await this.provider.listProjects();
      await this.saveSettings();
    } catch (error) {
      logger.warn('Could not refresh the project list; keeping the one from last time', error);
    }
  }

  /** Picks up a changed interval without waiting out the old one. */
  restartSyncSchedule(): void {
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
    }

    const period = this.settings.syncIntervalMinutes * MILLISECONDS_PER_MINUTE;
    this.syncIntervalId = window.setInterval(() => void this.syncTasks(), period);
    this.registerInterval(this.syncIntervalId);
  }

  async syncTasks(): Promise<void> {
    const reasonToSkip = this.describeWhySyncIsSkipped();

    if (reasonToSkip !== null) {
      logger.debug('Task sync skipped', reasonToSkip);
      return;
    }

    this.isSyncing = true;
    this.noteChangedWhileSyncing = false;

    try {
      const outcome = await (this.titleSync as TitleSync).run(this.settings.todoistProjectId);
      this.reportedSyncFailure = null;
      await this.adoptResolvedProject(outcome);
      this.reportSyncOutcome(outcome);
    } catch (error) {
      this.reportSyncFailure(error);
    } finally {
      this.isSyncing = false;
    }

    this.syncAgainIfNoteChanged();
  }

  /**
   * An edit made while a sync was running scheduled nothing, so it would otherwise wait for the
   * poll, which can be a day away. Our own write raises the same event; rather than telling the
   * two apart, the extra pass is allowed to run and find nothing to do. It writes nothing, so it
   * raises no event of its own and the chain always ends.
   */
  private syncAgainIfNoteChanged(): void {
    if (!this.noteChangedWhileSyncing) {
      return;
    }

    this.noteChangedWhileSyncing = false;
    logger.debug('The source note changed while syncing; running another pass');
    this.scheduleSync();
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
    this.taskLinks = TaskLinkStore.fromStored(isRecord(stored) ? stored.taskLinks : null);
    this.knownProjects = toKnownProjects(isRecord(stored) ? stored.knownProjects : null);
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      ...this.settings,
      taskLinks: this.taskLinks.toStored(),
      knownProjects: this.knownProjects,
    });
  }

  private createTitleSync(): TitleSync {
    const note = new ObsidianSourceNote(this.app.vault, () => this.sourceNoteFile);

    return new TitleSync(note, this.provider, this.taskLinks, () => this.saveSettings());
  }

  private get sourceNoteFile(): TFile | null {
    const path = this.settings.relativeTaskSourceNotePath;

    if (path.length === 0) {
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(path);

    return file instanceof TFile ? file : null;
  }

  private describeWhySyncIsSkipped(): string | null {
    if (this.titleSync === null) {
      return 'the plugin is still loading';
    }

    if (this.isSyncing) {
      return 'a sync is already running';
    }

    return this.sourceNoteFile === null ? 'no source note is configured' : null;
  }

  private async connectAndSync(): Promise<void> {
    await this.connectToTaskProvider();

    if (this.connection.status.state !== 'connected') {
      return;
    }

    await this.ensureProjectSelected();
    await this.syncTasks();
  }

  /**
   * Leaves the settings showing a real project from the first connection onwards. Called wherever
   * a connection is established, so pasting a token fills the field in without a restart.
   */
  async ensureProjectSelected(): Promise<void> {
    if (this.settings.todoistProjectId.length > 0) {
      return;
    }

    // Nothing has been remembered yet, so the list has to be asked for before a default exists.
    if (this.knownProjects.length === 0) {
      await this.refreshKnownProjects();
    }

    try {
      const fallback = defaultProjectOf(this.knownProjects);
      this.settings.todoistProjectId = fallback.id;
      this.settings.todoistProjectName = fallback.name;
      await this.saveSettings();
      logger.info('Project defaulted', fallback.name);
    } catch (error) {
      logger.warn('Could not determine a default project yet', error);
    }
  }

  /** The sync falls back to the provider's default project, so remember where it actually went. */
  private async adoptResolvedProject(outcome: SyncOutcome): Promise<void> {
    if (outcome.reassignedTo === null) {
      return;
    }

    const previousName = this.settings.todoistProjectName;
    this.settings.todoistProjectId = outcome.reassignedTo.id;
    this.settings.todoistProjectName = outcome.reassignedTo.name;
    await this.saveSettings();

    if (!outcome.replacedMissingProject) {
      logger.info('Project defaulted', outcome.reassignedTo.name);
      return;
    }

    logger.warn('Configured project is gone; fell back to the default', {
      from: previousName,
      to: outcome.reassignedTo.name,
    });
    new Notice(
      `Obsidian Task Sync: the project "${previousName}" no longer exists, ` +
        `so tasks are now synced to "${outcome.reassignedTo.name}". ` +
        'Pick a different project in the settings if that is not what you want.',
      NOTICE_UNTIL_DISMISSED,
    );
  }

  private reportSyncOutcome(outcome: { created: number; pushed: number; pulled: number }): void {
    const changed = outcome.created + outcome.pushed + outcome.pulled;

    if (changed === 0) {
      logger.debug('Task sync finished with nothing to do');
      return;
    }

    logger.info('Task sync finished', outcome);
  }

  private reportSyncFailure(error: unknown): void {
    const failure: TaskProviderFailure = error instanceof TaskProviderError ? error.failure : 'unexpected';
    const message = error instanceof TaskProviderError ? error.message : SYNC_FAILED_MESSAGE;

    if (isTransientFailure(failure)) {
      logger.warn('Task sync failed; it retries on its own', message);
      return;
    }

    logger.error('Task sync failed', error);

    // The same failure repeats on every tick, so the user only hears about it when it changes.
    if (this.reportedSyncFailure === failure) {
      return;
    }

    this.reportedSyncFailure = failure;
    new Notice(`Obsidian Task Sync: ${message}`, NOTICE_UNTIL_DISMISSED);
  }

  private reportConnectionStatus(status: ConnectionStatus): void {
    if (status.state !== 'failed') {
      logger.info('Task provider connection status', status.state);
      return;
    }

    if (isTransientFailure(status.failure)) {
      logger.warn('Task provider connection failed; it retries on its own', status.message);
      return;
    }

    logger.error('Task provider connection failed', status.message);
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
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        this.handleSourceNoteModify(file);
      }),
    );
  }

  private handleSourceNoteModify(file: TAbstractFile): void {
    if (file.path !== this.settings.relativeTaskSourceNotePath) {
      return;
    }

    if (this.isSyncing) {
      this.noteChangedWhileSyncing = true;
      return;
    }

    this.scheduleSync();
  }

  private scheduleSync(): void {
    this.cancelPendingSync();
    this.pendingSyncId = window.setTimeout(() => {
      this.pendingSyncId = null;
      void this.syncTasks();
    }, SYNC_DEBOUNCE_MS);
  }

  private cancelPendingSync(): void {
    if (this.pendingSyncId !== null) {
      window.clearTimeout(this.pendingSyncId);
      this.pendingSyncId = null;
    }
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
    todoistProjectId: readText(record.todoistProjectId, DEFAULT_SETTINGS.todoistProjectId),
    todoistProjectName: readText(record.todoistProjectName, DEFAULT_SETTINGS.todoistProjectName),
    syncIntervalMinutes: toSyncIntervalMinutes(
      record.syncIntervalMinutes,
      DEFAULT_SETTINGS.syncIntervalMinutes,
    ),
    debugMode: typeof record.debugMode === 'boolean' ? record.debugMode : DEFAULT_SETTINGS.debugMode,
  };
}

/** Anything malformed is dropped: a bad entry would offer the user a project that cannot exist. */
function toKnownProjects(stored: unknown): ProviderProject[] {
  if (!Array.isArray(stored)) {
    return [];
  }

  return stored.filter(isProviderProject);
}

function isProviderProject(value: unknown): value is ProviderProject {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    typeof value.isDefault === 'boolean'
  );
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
