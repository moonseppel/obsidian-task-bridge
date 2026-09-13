import { EventRef, MetadataCache, TFile, Vault } from 'obsidian';
import { TaskCollection, TaskCollectionSettings } from '../services/sync/task-collection';

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

describe('TaskCollection', () => {
  it('exposes a finder that resolves the configured scope', () => {
    const vault = { getMarkdownFiles: (): TFile[] => [tfile('Tasks.md')], getAbstractFileByPath: (): TFile | null => tfile('Tasks.md') } as unknown as Vault;
    const metadataCache = { getFileCache: () => null } as unknown as MetadataCache;
    const registerEvent = jest.fn();
    const collection = new TaskCollection(vault, metadataCache, () => SETTINGS, registerEvent, {
      onLocationRenamed: jest.fn(),
      onLocationDeleted: jest.fn(),
      onRelevantChange: jest.fn(),
    });

    expect(collection.finder.filesInScope().map((f) => f.path)).toEqual(['Tasks.md']);
  });

  it('registers a handler for each of the four vault events', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const vault = {
      on: (name: string, handler: (...args: unknown[]) => void): EventRef => {
        handlers.set(name, handler);
        return {} as EventRef;
      },
    } as unknown as Vault;
    const metadataCache = { getFileCache: () => null } as unknown as MetadataCache;
    const registerEvent = jest.fn();
    const callbacks = { onLocationRenamed: jest.fn(), onLocationDeleted: jest.fn(), onRelevantChange: jest.fn() };
    const collection = new TaskCollection(vault, metadataCache, () => SETTINGS, registerEvent, callbacks);

    collection.registerWatchers();

    expect(registerEvent).toHaveBeenCalledTimes(4);
    expect([...handlers.keys()].sort()).toEqual(['create', 'delete', 'modify', 'rename']);
  });

  it('routes a relevant modify event through to the callbacks', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const vault = {
      on: (name: string, handler: (...args: unknown[]) => void): EventRef => {
        handlers.set(name, handler);
        return {} as EventRef;
      },
    } as unknown as Vault;
    const metadataCache = { getFileCache: () => null } as unknown as MetadataCache;
    const callbacks = { onLocationRenamed: jest.fn(), onLocationDeleted: jest.fn(), onRelevantChange: jest.fn() };
    const collection = new TaskCollection(vault, metadataCache, () => SETTINGS, jest.fn(), callbacks);
    collection.registerWatchers();

    handlers.get('modify')?.(tfile('Tasks.md'));

    expect(callbacks.onRelevantChange).toHaveBeenCalledTimes(1);
  });
});
