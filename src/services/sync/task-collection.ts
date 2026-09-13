import { EventRef, MetadataCache, Vault } from 'obsidian';
import { TaskFinder, TaskFinderSettings } from './task-finder';
import { TaskChangeListener, TaskChangeListenerCallbacks, TaskChangeListenerSettings } from './task-change-listener';

export type TaskCollectionSettings = TaskFinderSettings & TaskChangeListenerSettings;
export type TaskCollectionSettingsReader = () => TaskCollectionSettings;
export type RegisterEvent = (eventRef: EventRef) => void;

/**
 * The task-source module: composes a submodule that finds which tasks are currently in scope
 * (`TaskFinder`) with one that reacts to vault changes (`TaskChangeListener`). See
 * architecture-rules.md rule 29. Holds no scope or event logic of its own.
 */
export class TaskCollection {
  readonly finder: TaskFinder;
  private readonly listener: TaskChangeListener;
  private readonly vault: Vault;
  private readonly registerEvent: RegisterEvent;

  constructor(
    vault: Vault,
    metadataCache: MetadataCache,
    readSettings: TaskCollectionSettingsReader,
    registerEvent: RegisterEvent,
    callbacks: TaskChangeListenerCallbacks,
  ) {
    this.vault = vault;
    this.registerEvent = registerEvent;
    this.finder = new TaskFinder(vault, metadataCache, readSettings);
    this.listener = new TaskChangeListener(readSettings, callbacks);
  }

  registerWatchers(): void {
    this.registerEvent(this.vault.on('create', (file) => this.listener.handleCreate(file)));
    this.registerEvent(this.vault.on('modify', (file) => this.listener.handleModify(file)));
    this.registerEvent(this.vault.on('rename', (file, oldPath) => this.listener.handleRename(file, oldPath)));
    this.registerEvent(this.vault.on('delete', (file) => this.listener.handleDelete(file)));
  }
}
