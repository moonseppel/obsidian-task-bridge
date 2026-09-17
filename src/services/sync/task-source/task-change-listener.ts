import { TAbstractFile, TFile } from 'obsidian';
import { matchesIgnorePattern } from '../../../utils/ignore-pattern';
import { Logger } from '../../../utils/logger';

const logger = new Logger('TaskBridge:Sync');

export interface TaskChangeListenerSettings {
  readonly relativeTaskSourcePath: string;
  readonly syncWholeVault: boolean;
  readonly ignoreFilePatterns: string;
}

export type TaskChangeSettingsReader = () => TaskChangeListenerSettings;

export interface TaskChangeListenerCallbacks {
  /** The configured note or folder itself was renamed or moved; the setting should follow it. */
  onLocationRenamed(newPath: string, oldPath: string): void;
  /** The configured note or folder itself was deleted, or moved to local trash. */
  onLocationDeleted(): void;
  /** Something inside the configured scope changed; the plugin decides whether to sync now. */
  onRelevantChange(): void;
}

/**
 * Decides whether a vault event matters to the configured task source — the "reacting" half of
 * the task-source module (architecture-rules.md rule 29). Registering with `vault.on` stays with
 * the caller, since only a `Component` can own that registration.
 */
export class TaskChangeListener {
  private readonly readSettings: TaskChangeSettingsReader;
  private readonly callbacks: TaskChangeListenerCallbacks;

  constructor(readSettings: TaskChangeSettingsReader, callbacks: TaskChangeListenerCallbacks) {
    this.readSettings = readSettings;
    this.callbacks = callbacks;
  }

  handleCreate(file: TAbstractFile): void {
    this.reactIfRelevant(file);
  }

  handleModify(file: TAbstractFile): void {
    this.reactIfRelevant(file);
  }

  handleDelete(file: TAbstractFile): void {
    if (this.isConfiguredLocation(file.path)) {
      this.callbacks.onLocationDeleted();
      return;
    }

    this.reactIfRelevant(file);
  }

  handleRename(file: TAbstractFile, oldPath: string): void {
    if (this.isConfiguredLocation(oldPath)) {
      if (isInLocalTrash(file.path)) {
        this.callbacks.onLocationDeleted();
        return;
      }

      this.callbacks.onLocationRenamed(file.path, oldPath);
      return;
    }

    this.reactIfRelevant(file);
  }

  private isConfiguredLocation(path: string): boolean {
    const settings = this.readSettings();
    return !settings.syncWholeVault && path.length > 0 && path === settings.relativeTaskSourcePath;
  }

  private reactIfRelevant(file: TAbstractFile): void {
    if (file instanceof TFile && this.isRelevant(file)) {
      logger.debug('Note in scope changed', { path: file.path });
      this.callbacks.onRelevantChange();
    }
  }

  private isRelevant(file: TFile): boolean {
    if (file.extension !== 'md') {
      return false;
    }

    const settings = this.readSettings();

    // An explicitly selected single note is always relevant, ignore pattern notwithstanding (rule 31).
    if (!settings.syncWholeVault && file.path === settings.relativeTaskSourcePath) {
      return true;
    }

    if (matchesIgnorePattern(file.name, settings.ignoreFilePatterns)) {
      return false;
    }

    return settings.syncWholeVault || isInsideFolder(file, settings.relativeTaskSourcePath);
  }
}

function isInLocalTrash(path: string): boolean {
  return path === '.trash' || path.startsWith('.trash/');
}

function isInsideFolder(file: TFile, folderPath: string): boolean {
  return folderPath.length > 0 && file.path.startsWith(`${folderPath}/`);
}
