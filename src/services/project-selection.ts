import { sanitizeForDisplay } from '../utils/external-text';
import { Logger } from '../utils/logger';
import { NotifyUser } from './status-reporter';
import { ProjectResolution } from './sync/sync-run/project-resolver';
import { ProviderProject, defaultProjectOf } from './task-provider';

export interface SelectedProject {
  projectId: string;
  projectName: string;
}

export interface ProjectSelectionDependencies {
  readonly listProjects: () => Promise<ProviderProject[]>;
  readonly settings: () => SelectedProject;
  readonly saveSettings: () => Promise<void>;
  readonly logger: Logger;
  readonly announce: NotifyUser;
}

/**
 * Which project tasks sync into, and the remembered project list the settings picker offers, so it
 * still has choices while offline. The list is refreshed deliberately rarely: only on opening the
 * settings, changing the token, or testing the connection.
 */
export class ProjectSelection {
  private readonly listProjects: () => Promise<ProviderProject[]>;
  private readonly settings: () => SelectedProject;
  private readonly saveSettings: () => Promise<void>;
  private readonly logger: Logger;
  private readonly announce: NotifyUser;
  private remembered: ProviderProject[] = [];

  constructor(dependencies: ProjectSelectionDependencies) {
    this.listProjects = dependencies.listProjects;
    this.settings = dependencies.settings;
    this.saveSettings = dependencies.saveSettings;
    this.logger = dependencies.logger;
    this.announce = dependencies.announce;
  }

  get knownProjects(): readonly ProviderProject[] {
    return this.remembered;
  }

  remember(projects: ProviderProject[]): void {
    this.remembered = projects;
  }

  async refresh(): Promise<void> {
    try {
      this.remembered = await this.listProjects();
      this.logger.debug('Project list refreshed', { projects: this.remembered.length });
      await this.saveSettings();
    } catch (error) {
      this.logger.warn('Could not refresh the project list; keeping the one from last time', error);
    }
  }

  /**
   * Leaves the settings showing a real project from the first connection onwards. Called wherever
   * a connection is established, so pasting a token fills the field in without a restart.
   */
  async ensureSelected(): Promise<void> {
    if (this.settings().projectId.length > 0) {
      return;
    }

    // Nothing has been remembered yet, so the list has to be asked for before a default exists.
    if (this.remembered.length === 0) {
      await this.refresh();
    }

    try {
      await this.select(defaultProjectOf(this.remembered));
    } catch (error) {
      this.logger.warn('Could not determine a default project yet', error);
    }
  }

  /** The sync falls back to the provider's default project, so remember where it actually went. */
  async adopt(resolution: ProjectResolution): Promise<void> {
    if (resolution.kind === 'configured') {
      return;
    }

    const previousName = this.settings().projectName;
    await this.select(resolution.project);

    if (resolution.kind === 'replaced') {
      this.reportReplaced(previousName, resolution.project.name);
    }
  }

  private async select(project: ProviderProject): Promise<void> {
    const settings = this.settings();

    settings.projectId = project.id;
    settings.projectName = project.name;
    await this.saveSettings();
    this.logger.info('Project selected', sanitizeForDisplay(project.name));
  }

  private reportReplaced(previousName: string, currentName: string): void {
    const previous = sanitizeForDisplay(previousName);
    const current = sanitizeForDisplay(currentName);

    this.logger.warn('Configured project is gone; fell back to the default', { from: previous, to: current });
    this.announce(
      `the project "${previous}" no longer exists, so tasks are now synced to "${current}". ` +
        'Pick a different project in the settings if that is not what you want.',
    );
  }
}
