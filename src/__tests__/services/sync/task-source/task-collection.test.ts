import { EventRef, MetadataCache, TFile, Vault } from 'obsidian';
import { TaskChangeListenerCallbacks } from '../../../../services/sync/task-source/task-change-listener';
import { RegisterEvent, TaskCollection, TaskCollectionSettings } from '../../../../services/sync/task-source/task-collection';

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split('/').pop() ?? path;
  file.extension = 'md';
  return file;
}

const SETTINGS: TaskCollectionSettings = {
  relativeTaskSourcePath: 'Tasks.md',
  syncWholeVault: false,
  sourceTag: '',
  ignoreFilePatterns: '',
};

function silentCallbacks(): TaskChangeListenerCallbacks {
  return { onLocationRenamed: jest.fn(), onLocationDeleted: jest.fn(), onRelevantChange: jest.fn() };
}

function vaultRecordingHandlers(handlers: Map<string, (...args: unknown[]) => void>): Vault {
  return {
    on: (name: string, handler: (...args: unknown[]) => void): EventRef => {
      handlers.set(name, handler);
      return {} as EventRef;
    },
  } as unknown as Vault;
}

function collectionOver(
  vault: Vault,
  registerEvent: RegisterEvent,
  callbacks: TaskChangeListenerCallbacks = silentCallbacks(),
): TaskCollection {
  const metadataCache = { getFileCache: () => null } as unknown as MetadataCache;

  return new TaskCollection({ vault, metadataCache, readSettings: () => SETTINGS, registerEvent, callbacks });
}

describe('TaskCollection', () => {
  it('resolves the configured scope to file paths', () => {
    const vault = {
      getMarkdownFiles: (): TFile[] => [tfile('Tasks.md')],
      getAbstractFileByPath: (): TFile | null => tfile('Tasks.md'),
    } as unknown as Vault;
    const collection = collectionOver(vault, jest.fn());

    expect(collection.filesInScope()).toEqual(['Tasks.md']);
  });

  it('registers a handler for each of the four vault events', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const registerEvent = jest.fn();
    const collection = collectionOver(vaultRecordingHandlers(handlers), registerEvent);

    collection.registerWatchers();

    expect(registerEvent).toHaveBeenCalledTimes(4);
    expect([...handlers.keys()].sort()).toEqual(['create', 'delete', 'modify', 'rename']);
  });

  it('routes a relevant modify event through to the callbacks', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const callbacks = silentCallbacks();
    const collection = collectionOver(vaultRecordingHandlers(handlers), jest.fn(), callbacks);
    collection.registerWatchers();

    handlers.get('modify')?.(tfile('Tasks.md'));

    expect(callbacks.onRelevantChange).toHaveBeenCalledTimes(1);
  });
});
