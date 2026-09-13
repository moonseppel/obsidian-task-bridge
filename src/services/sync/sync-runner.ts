import { Logger } from '../../utils/logger';
import { StatusReporter } from '../status-reporter';
import { ProjectResolution } from './project-resolver';
import { SyncOutcome } from './sync-outcome';

export interface SyncRunnerDependencies {
  readonly hasFilesInScope: () => boolean;
  readonly sync: () => Promise<SyncOutcome>;
  readonly adoptProject: (resolution: ProjectResolution) => Promise<void>;
  readonly reporter: StatusReporter;
  readonly syncWhenTypingStops: () => void;
  readonly logger: Logger;
}

/**
 * Runs one sync at a time. An edit made while a sync is running would otherwise wait for the poll,
 * which can be a day away, so it earns one follow-up pass instead. The plugin's own write raises the
 * same event; rather than telling the two apart, the extra pass is allowed to run and find nothing
 * to do. It writes nothing, so it raises no event of its own and the chain always ends.
 */
export class SyncRunner {
  private readonly hasFilesInScope: () => boolean;
  private readonly sync: () => Promise<SyncOutcome>;
  private readonly adoptProject: (resolution: ProjectResolution) => Promise<void>;
  private readonly reporter: StatusReporter;
  private readonly syncWhenTypingStops: () => void;
  private readonly logger: Logger;
  private isSyncing = false;
  private changedWhileSyncing = false;
  private reportedNoNotesInScope = false;

  constructor(dependencies: SyncRunnerDependencies) {
    this.hasFilesInScope = dependencies.hasFilesInScope;
    this.sync = dependencies.sync;
    this.adoptProject = dependencies.adoptProject;
    this.reporter = dependencies.reporter;
    this.syncWhenTypingStops = dependencies.syncWhenTypingStops;
    this.logger = dependencies.logger;
  }

  async run(): Promise<void> {
    if (this.shouldSkip()) {
      return;
    }

    this.isSyncing = true;
    this.changedWhileSyncing = false;
    this.reportedNoNotesInScope = false;

    try {
      const outcome = await this.sync();
      await this.adoptProject(outcome.projectResolution);
      this.reporter.reportSyncOutcome(outcome);
    } catch (error) {
      this.reporter.reportSyncFailure(error);
    } finally {
      this.isSyncing = false;
    }

    this.followUpIfChangedWhileSyncing();
  }

  handleRelevantChange(): void {
    if (this.isSyncing) {
      this.changedWhileSyncing = true;
      return;
    }

    this.syncWhenTypingStops();
  }

  private shouldSkip(): boolean {
    if (this.isSyncing) {
      this.logger.debug('Task sync skipped', 'a sync is already running');
      return true;
    }

    if (!this.hasFilesInScope()) {
      this.reportNoNotesInScope();
      return true;
    }

    return false;
  }

  /** Said once at info, since it holds until the settings change, and only at debug after that. */
  private reportNoNotesInScope(): void {
    if (this.reportedNoNotesInScope) {
      this.logger.debug('Task sync skipped', 'no notes are in scope');
      return;
    }

    this.reportedNoNotesInScope = true;
    this.logger.info('No notes are in scope, so nothing is synced until a note, folder or the whole vault is chosen');
  }

  private followUpIfChangedWhileSyncing(): void {
    if (!this.changedWhileSyncing) {
      return;
    }

    this.changedWhileSyncing = false;
    this.logger.debug('A note in scope changed while syncing; running another pass');
    this.syncWhenTypingStops();
  }
}
