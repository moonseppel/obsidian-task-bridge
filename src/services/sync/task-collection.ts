import { EventRef, MetadataCache, Vault } from 'obsidian';
import { TaskFinder, TaskFinderSettings } from './task-finder';
import { TaskChangeListener, TaskChangeListenerCallbacks, TaskChangeListenerSettings } from './task-change-listener';
import { ParsedTaskLine } from './task-line';

export type TaskCollectionSettings = TaskFinderSettings & TaskChangeListenerSettings;
export type TaskCollectionSettingsReader = () => TaskCollectionSettings;
export type RegisterEvent = (eventRef: EventRef) => void;

export interface TaskCollectionDependencies {
  readonly vault: Vault;
  readonly metadataCache: MetadataCache;
  readonly readSettings: TaskCollectionSettingsReader;
  readonly registerEvent: RegisterEvent;
  readonly callbacks: TaskChangeListenerCallbacks;
}

/**
 * The task-source module: composes a submodule that finds which tasks are currently in scope
 * (`TaskFinder`) with one that reacts to vault changes (`TaskChangeListener`). See
 * architecture-rules.md rule 29. Holds no scope or event logic of its own.
 */
export class TaskCollection {
  private readonly finder: TaskFinder;
  private readonly listener: TaskChangeListener;
  private readonly vault: Vault;
  private readonly registerEvent: RegisterEvent;

  constructor(dependencies: TaskCollectionDependencies) {
    this.vault = dependencies.vault;
    this.registerEvent = dependencies.registerEvent;
    this.finder = new TaskFinder(dependencies.vault, dependencies.metadataCache, dependencies.readSettings);
    this.listener = new TaskChangeListener(dependencies.readSettings, dependencies.callbacks);
  }

  registerWatchers(): void {
    this.registerEvent(this.vault.on('create', (file) => this.listener.handleCreate(file)));
    this.registerEvent(this.vault.on('modify', (file) => this.listener.handleModify(file)));
    this.registerEvent(this.vault.on('rename', (file, oldPath) => this.listener.handleRename(file, oldPath)));
    this.registerEvent(this.vault.on('delete', (file) => this.listener.handleDelete(file)));
  }

  filesInScope(): string[] {
    return this.finder.filesInScope().map((file) => file.path);
  }

  isTagInScope(task: ParsedTaskLine): boolean {
    return this.finder.isTagInScope(task);
  }

  existsOutsideIgnoredFiles(blockId: string): boolean {
    return this.finder.existsOutsideIgnoredFiles(blockId);
  }
}
