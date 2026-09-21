import { DataAdapter, normalizePath } from 'obsidian';
import { Logger } from '../../utils/logger';
import { UserStatus } from '../user-status';
import { DEFAULT_TASKS_STATUSES, readTasksStatuses } from './tasks-statuses';

const logger = new Logger('TaskBridge:TasksPlugin');

const TASKS_PLUGIN_ID = 'obsidian-tasks-plugin';
const ENABLED_PLUGINS_FILE = 'community-plugins.json';
const TASKS_SETTINGS_FILE = `plugins/${TASKS_PLUGIN_ID}/data.json`;

/** How the Tasks plugin is set up in this vault, as far as syncing is concerned. */
export interface TasksPluginSetup {
  readonly statuses: readonly UserStatus[];
}

export type ConfigFiles = Pick<DataAdapter, 'exists' | 'read'>;

/**
 * Reads the Tasks plugin's setup from its files every time it is asked, so a change made in its own
 * settings applies from the next sync run on.
 */
export class TasksPluginReader {
  private readonly files: ConfigFiles;
  private readonly configDir: string;
  /** Files already warned about, so one that stays broken does not fill the console on every run. */
  private readonly unreadable = new Set<string>();

  constructor(files: ConfigFiles, configDir: string) {
    this.files = files;
    this.configDir = configDir;
  }

  /** Nothing while the Tasks plugin is not enabled in this vault. */
  async read(): Promise<TasksPluginSetup | undefined> {
    const enabledPlugins = await this.readJson(ENABLED_PLUGINS_FILE);

    if (!Array.isArray(enabledPlugins) || !enabledPlugins.includes(TASKS_PLUGIN_ID)) {
      return undefined;
    }

    const settings = await this.readJson(TASKS_SETTINGS_FILE);

    return { statuses: settings === undefined ? DEFAULT_TASKS_STATUSES : readTasksStatuses(settings) };
  }

  private async readJson(file: string): Promise<unknown> {
    const path = normalizePath(`${this.configDir}/${file}`);

    try {
      const parsed = await this.parseIfPresent(path);
      this.unreadable.delete(path);
      return parsed;
    } catch {
      this.warnOnce(path);
      return undefined;
    }
  }

  private async parseIfPresent(path: string): Promise<unknown> {
    return (await this.files.exists(path)) ? JSON.parse(await this.files.read(path)) : undefined;
  }

  private warnOnce(path: string): void {
    if (!this.unreadable.has(path)) {
      this.unreadable.add(path);
      logger.warn('Could not read a settings file of the Tasks plugin setup; going on without it', { path });
    }
  }
}
