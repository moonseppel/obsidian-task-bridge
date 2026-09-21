import { DataAdapter, normalizePath } from 'obsidian';
import { Logger } from '../../utils/logger';

const logger = new Logger('TaskBridge:TasksPlugin');

const TASKS_PLUGIN_ID = 'obsidian-tasks-plugin';
const ENABLED_PLUGINS_FILE = 'community-plugins.json';

export type ConfigFiles = Pick<DataAdapter, 'exists' | 'read'>;

/**
 * Whether the Tasks plugin is enabled in this vault, read fresh every time it is asked, so a change
 * made in the plugin list applies from the next sync run on.
 */
export class TasksPluginReader {
  private readonly files: ConfigFiles;
  private readonly configDir: string;
  /** Whether the plugin list was unreadable last time, so a file that stays broken warns only once. */
  private unreadable = false;

  constructor(files: ConfigFiles, configDir: string) {
    this.files = files;
    this.configDir = configDir;
  }

  async isEnabled(): Promise<boolean> {
    const enabledPlugins = await this.readJson();

    return Array.isArray(enabledPlugins) && enabledPlugins.includes(TASKS_PLUGIN_ID);
  }

  private async readJson(): Promise<unknown> {
    const path = normalizePath(`${this.configDir}/${ENABLED_PLUGINS_FILE}`);

    try {
      const parsed = await this.parseIfPresent(path);
      this.unreadable = false;
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
    if (!this.unreadable) {
      this.unreadable = true;
      logger.warn('Could not read which community plugins are enabled; assuming the Tasks plugin is off', { path });
    }
  }
}
