import { Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianTaskSyncSettings, ObsidianTaskSyncSettingTab } from './settings';
import { ProviderConnection } from './services/provider-connection';
import { StatusReporter } from './services/status-reporter';
import { ProviderProject, defaultProjectOf } from './services/task-provider';
import { getDeviceTag } from './services/sync/device-tag';
import { ObsidianSourceNote } from './services/sync/obsidian-source-note';
import { OrphanTracker } from './services/sync/orphan-tracker';
import { SyncScheduler } from './services/sync/sync-scheduler';
import { TaskLinkStore } from './services/sync/task-links';
import { ProjectResolution } from './services/sync/project-resolver';
import { TaskSync } from './services/sync/task-sync';
import { TodoistCredentials } from './services/todoist/todoist-credentials';
import { createTodoistProvider } from './services/todoist/todoist-provider';
import { readProviderCredentials, toKnownProjects, toSettings } from './stored-data';
import { readStoredField } from './stored-data';
import { sanitizeForDisplay } from './utils/external-text';
import { Logger, setDebugLogging } from './utils/logger';
import { hideRenderedAnchors } from './views/rendered-anchor';

const logger = new Logger('ObsidianTaskSync');
const NOTICE_UNTIL_DISMISSED = 0;
const DEBUG_BODY_CLASS = 'obsidian-task-sync-debug';
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

function announce(message: string): void {
  new Notice(`Obsidian Task Sync: ${message}`, NOTICE_UNTIL_DISMISSED);
}

export default class ObsidianTaskSyncPlugin extends Plugin {
  settings: ObsidianTaskSyncSettings = { ...DEFAULT_SETTINGS };
  taskLinks = new TaskLinkStore();
  orphanedTasks = new OrphanTracker();
  /** The last project list seen, so the picker still offers choices while offline. */
  knownProjects: ProviderProject[] = [];
  readonly credentials = new TodoistCredentials(this.app, () => this.saveSettings());
  private readonly provider = createTodoistProvider(this.credentials);
  connection = new ProviderConnection(this.provider);
  private readonly reporter = new StatusReporter(logger, announce);
  private readonly taskSync = new TaskSync({
    note: new ObsidianSourceNote(this.app.vault, () => this.sourceNoteFile),
    provider: this.provider,
    links: this.taskLinks,
    saveLinks: () => this.saveSettings(),
    getDeviceTag: () => getDeviceTag(window.localStorage),
    orphans: this.orphanedTasks,
  });
  private readonly scheduler = new SyncScheduler(
    () => void this.syncTasks(),
    (id) => this.registerInterval(id),
  );
  private isSyncing = false;
  private noteChangedWhileSyncing = false;

  async onload(): Promise<void> {
    try {
      await this.loadSettings();
      this.applyDebugMode();
      this.addSettingTab(new ObsidianTaskSyncSettingTab(this.app, this));
      this.addCommand({ id: 'sync-now', name: 'Sync now', callback: () => void this.syncTasks() });
      this.registerMarkdownPostProcessor((element) => this.hideAnchorsUnlessDebugging(element));
      this.registerSourceNoteWatchers();
      this.register(() => this.scheduler.cancelPendingSync());
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
    this.reporter.reportConnectionStatus(await this.connection.connect());
  }

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

  /**
   * Leaves the settings showing a real project from the first connection onwards. Called wherever
   * a connection is established, so pasting a token fills the field in without a restart.
   */
  async ensureProjectSelected(): Promise<void> {
    if (this.settings.projectId.length > 0) {
      return;
    }

    // Nothing has been remembered yet, so the list has to be asked for before a default exists.
    if (this.knownProjects.length === 0) {
      await this.refreshKnownProjects();
    }

    try {
      await this.storeProject(defaultProjectOf(this.knownProjects));
    } catch (error) {
      logger.warn('Could not determine a default project yet', error);
    }
  }

  restartSyncSchedule(): void {
    this.scheduler.restartPolling(this.settings.syncIntervalMinutes);
  }

  async syncTasks(): Promise<void> {
    if (this.shouldSkipSync()) {
      return;
    }

    this.isSyncing = true;
    this.noteChangedWhileSyncing = false;

    try {
      const outcome = await this.taskSync.run(this.settings.projectId);
      await this.adoptResolvedProject(outcome.projectResolution);
      this.reporter.reportSyncOutcome(outcome);
    } catch (error) {
      this.reporter.reportSyncFailure(error);
    } finally {
      this.isSyncing = false;
    }

    this.syncAgainIfNoteChanged();
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
    this.credentials.restore(readProviderCredentials(stored));
    this.taskLinks.replaceAll(readStoredField(stored, 'taskLinks'));
    this.orphanedTasks.replaceAll(readStoredField(stored, 'orphanedTasks'));
    this.knownProjects = toKnownProjects(readStoredField(stored, 'knownProjects'));
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      ...this.settings,
      taskLinks: this.taskLinks.toStored(),
      orphanedTasks: this.orphanedTasks.toStored(),
      knownProjects: this.knownProjects,
      providerCredentials: this.credentials.toStored(),
    });
  }

  private hideAnchorsUnlessDebugging(element: HTMLElement): void {
    if (!this.settings.debugMode) {
      hideRenderedAnchors(element);
    }
  }

  private shouldSkipSync(): boolean {
    if (this.isSyncing) {
      logger.debug('Task sync skipped', 'a sync is already running');
      return true;
    }

    if (this.sourceNoteFile === null) {
      logger.debug('Task sync skipped', 'no source note is configured');
      return true;
    }

    return false;
  }

  private get sourceNoteFile(): TFile | null {
    const path = this.settings.relativeTaskSourceNotePath;

    if (path.length === 0) {
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(path);

    return file instanceof TFile ? file : null;
  }

  private async connectAndSync(): Promise<void> {
    await this.connectToTaskProvider();

    if (this.connection.status.state !== 'connected') {
      return;
    }

    await this.ensureProjectSelected();
    await this.syncTasks();
  }

  /** The sync falls back to the provider's default project, so remember where it actually went. */
  private async adoptResolvedProject(resolution: ProjectResolution): Promise<void> {
    if (resolution.kind === 'configured') {
      return;
    }

    const previousName = this.settings.projectName;
    await this.storeProject(resolution.project);

    if (resolution.kind === 'replaced') {
      this.reportReplacedProject(previousName, resolution.project.name);
    }
  }

  private async storeProject(project: ProviderProject): Promise<void> {
    this.settings.projectId = project.id;
    this.settings.projectName = project.name;
    await this.saveSettings();
    logger.info('Project selected', sanitizeForDisplay(project.name));
  }

  private reportReplacedProject(previousName: string, currentName: string): void {
    const previous = sanitizeForDisplay(previousName);
    const current = sanitizeForDisplay(currentName);

    logger.warn('Configured project is gone; fell back to the default', { from: previous, to: current });
    announce(
      `the project "${previous}" no longer exists, so tasks are now synced to "${current}". ` +
        'Pick a different project in the settings if that is not what you want.',
    );
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
    this.scheduler.syncWhenTypingStops();
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

    this.scheduler.syncWhenTypingStops();
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
