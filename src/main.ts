import { Platform, Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, TaskBridgeSettings, TaskBridgeSettingTab } from './settings';
import { readEditorTabSize } from './services/editor-tab-size';
import { ProjectSelection } from './services/project-selection';
import { ProviderConnection } from './services/provider-connection';
import { StatusReporter } from './services/status-reporter';
import { ProviderProject } from './services/task-provider';
import { getDeviceTag } from './services/sync/task-format/device-tag';
import { ObsidianSourceNote } from './services/sync/note-access/obsidian-source-note';
import { OrphanTracker } from './services/sync/orphans/orphan-tracker';
import { SyncRunner } from './services/sync/sync-run/sync-runner';
import { SyncScheduler } from './services/sync/sync-run/sync-scheduler';
import { TaskCollection } from './services/sync/task-source/task-collection';
import { TaskLinkStore } from './services/sync/sync-state/task-links';
import { TaskSync } from './services/sync/sync-pass/task-sync';
import { TodoistCredentials } from './services/todoist/todoist-credentials';
import { createTodoistProvider } from './services/todoist/todoist-provider';
import { readProviderCredentials, readStoredField, toKnownProjects, toSettings } from './stored-data';
import { Logger, setDebugLogging } from './utils/logger';
import { announce, inform } from './views/notices';
import { hideRenderedAnchors } from './views/rendered-anchor';

const logger = new Logger('TaskBridge');
const DEBUG_BODY_CLASS = 'task-bridge-debug';
const LOAD_FAILED_NOTICE =
  'failed to load. Check the console for details, or contact the author with the console output.';
const UNREADABLE_SETTINGS_LOG =
  'Settings file could not be read; falling back to defaults. ' +
  'Corrupted file is retained until settings are re-saved.';
const UNREADABLE_SETTINGS_NOTICE =
  'the settings file could not be read and may be corrupted. ' +
  'Default settings have been restored. Check your plugin settings.';

export default class TaskBridgePlugin extends Plugin {
  settings: TaskBridgeSettings = { ...DEFAULT_SETTINGS };
  taskLinks = new TaskLinkStore();
  orphanedTasks = new OrphanTracker();
  readonly credentials = new TodoistCredentials(this.app, () => this.saveSettings());
  private readonly provider = createTodoistProvider(this.credentials);
  connection = new ProviderConnection(this.provider);
  private readonly reporter = new StatusReporter(logger, announce, {
    get: () => this.settings.lastCredentialReminderAt,
    set: (at) => {
      this.settings.lastCredentialReminderAt = at;
      void this.saveSettings();
    },
  });
  private readonly projects = new ProjectSelection({
    listProjects: () => this.provider.listProjects(),
    settings: () => this.settings,
    saveSettings: () => this.saveSettings(),
    logger,
    announce,
  });
  private readonly taskCollection: TaskCollection = new TaskCollection({
    vault: this.app.vault,
    metadataCache: this.app.metadataCache,
    readSettings: () => this.settings,
    registerEvent: (eventRef) => this.registerEvent(eventRef),
    callbacks: {
      onLocationRenamed: (newPath, oldPath) => void this.followRenamedLocation(newPath, oldPath),
      onLocationDeleted: () => void this.clearSourceLocation(),
      onRelevantChange: () => this.syncRunner.handleRelevantChange(),
    },
  });
  private readonly taskSync = new TaskSync({
    filesInScope: () => this.taskCollection.filesInScope(),
    noteFor: (path) => new ObsidianSourceNote(this.app.vault, () => this.fileAt(path)),
    isTagInScope: (task) => this.taskCollection.isTagInScope(task),
    existsOutsideIgnoredFiles: (blockId) => this.taskCollection.existsOutsideIgnoredFiles(blockId),
    locateParentFile: (blockId) => this.taskCollection.locateParentFile(blockId),
    provider: this.provider,
    links: this.taskLinks,
    saveLinks: () => this.saveSettings(),
    getDeviceTag: () => getDeviceTag(window.localStorage),
    readTabSize: () => readEditorTabSize(this.app.vault),
    orphans: this.orphanedTasks,
  });
  private readonly scheduler = new SyncScheduler(
    () => void this.syncTasks(),
    (id) => this.registerInterval(id),
  );
  private readonly syncRunner: SyncRunner = new SyncRunner({
    hasFilesInScope: () => this.taskCollection.filesInScope().length > 0,
    sync: () => this.taskSync.run(this.settings.projectId),
    adoptProject: (resolution) => this.projects.adopt(resolution),
    reporter: this.reporter,
    syncWhenTypingStops: () => this.scheduler.syncWhenTypingStops(),
    logger,
  });

  async onload(): Promise<void> {
    try {
      await this.loadSettings();
      this.applyDebugMode();
      this.addSettingTab(new TaskBridgeSettingTab(this.app, this));
      this.addCommand({ id: 'sync-now', name: 'Sync now', callback: () => void this.syncTasks() });
      this.registerMarkdownPostProcessor((element) => this.hideAnchorsUnlessDebugging(element));
      this.taskCollection.registerWatchers();
      this.register(() => this.scheduler.cancelPendingSync());
      this.restartSyncSchedule();
      void this.connectAndSync();

      logger.info('TaskBridge plugin loaded', { version: this.manifest.version, platform: platformName() });
    } catch (error) {
      logger.error('Plugin load failed', error);
      inform(LOAD_FAILED_NOTICE);
    }
  }

  async onunload(): Promise<void> {
    document.body.removeClass(DEBUG_BODY_CLASS);
    logger.info('TaskBridge plugin unloaded');
  }

  get knownProjects(): readonly ProviderProject[] {
    return this.projects.knownProjects;
  }

  async connectToTaskProvider(): Promise<void> {
    this.reporter.reportConnectionStatus(await this.connection.connect());
  }

  applyDebugMode(): void {
    setDebugLogging(this.settings.debugMode);
    document.body.toggleClass(DEBUG_BODY_CLASS, this.settings.debugMode);
    logger.info(this.settings.debugMode ? 'Debug mode is on' : 'Debug mode is off');
  }

  async refreshKnownProjects(): Promise<void> {
    await this.projects.refresh();
  }

  async ensureProjectSelected(): Promise<void> {
    await this.projects.ensureSelected();
  }

  restartSyncSchedule(): void {
    this.scheduler.restartPolling(this.settings.syncIntervalMinutes);
    logger.info('Checking for changes on a timer', { everyMinutes: this.settings.syncIntervalMinutes });
  }

  async syncTasks(): Promise<void> {
    await this.syncRunner.run();
  }

  async loadSettings(): Promise<void> {
    let stored: unknown;

    try {
      stored = await this.loadData();
    } catch (error) {
      logger.warn(UNREADABLE_SETTINGS_LOG, error);
      inform(UNREADABLE_SETTINGS_NOTICE);
    }

    this.settings = toSettings(stored);
    this.credentials.restore(readProviderCredentials(stored));
    this.taskLinks.replaceAll(readStoredField(stored, 'taskLinks'));
    this.orphanedTasks.replaceAll(readStoredField(stored, 'orphanedTasks'));
    this.projects.remember(toKnownProjects(readStoredField(stored, 'knownProjects')));
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      ...this.settings,
      taskLinks: this.taskLinks.toStored(),
      orphanedTasks: this.orphanedTasks.toStored(),
      knownProjects: this.projects.knownProjects,
      providerCredentials: this.credentials.toStored(),
    });
  }

  private hideAnchorsUnlessDebugging(element: HTMLElement): void {
    if (!this.settings.debugMode) {
      hideRenderedAnchors(element);
    }
  }

  private fileAt(path: string): TFile | undefined {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : undefined;
  }

  private async connectAndSync(): Promise<void> {
    await this.connectToTaskProvider();

    if (this.connection.status.state !== 'connected') {
      return;
    }

    await this.ensureProjectSelected();
    await this.syncTasks();
  }

  private async followRenamedLocation(newPath: string, oldPath: string): Promise<void> {
    this.settings.relativeTaskSourcePath = newPath;
    await this.saveSettings();
    logger.info('Source location moved; setting updated', { from: oldPath, to: newPath });
  }

  private async clearSourceLocation(): Promise<void> {
    const previousPath = this.settings.relativeTaskSourcePath;
    this.settings.relativeTaskSourcePath = '';

    inform(
      `the source note or folder "${previousPath}" no longer exists, ` +
        'so it has been cleared from the plugin settings.',
    );
    logger.warn('Source location removed; setting cleared', { previousPath });

    await this.saveSettings();
  }
}

function platformName(): string {
  return Platform.isMobile ? 'mobile' : 'desktop';
}
