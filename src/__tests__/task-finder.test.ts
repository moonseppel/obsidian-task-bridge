import { MetadataCache, TFile, TFolder, Vault } from 'obsidian';
import { TaskFinder, TaskFinderSettings } from '../services/sync/task-finder';
import { parseTaskLine } from '../services/sync/task-line';

const BASE_SETTINGS: TaskFinderSettings = {
  relativeTaskSourcePath: '',
  syncWholeVault: false,
  sourceTag: '',
  ignoreFilePatterns: '',
};

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split('/').pop() ?? path;
  return file;
}

function tfolder(path: string): TFolder {
  const folder = new TFolder();
  folder.path = path;
  return folder;
}

interface FakeVaultOptions {
  files: string[];
  folders?: string[];
  blocksByFile?: Record<string, string[]>;
}

function finderWith(options: FakeVaultOptions, settings: Partial<TaskFinderSettings> = {}): TaskFinder {
  const files = options.files.map(tfile);
  const foldersByPath = new Map<string, TFolder>((options.folders ?? []).map((path) => [path, tfolder(path)]));
  const filesByPath = new Map<string, TFile>(files.map((file) => [file.path, file]));

  const vault = {
    getMarkdownFiles: (): TFile[] => files,
    getAbstractFileByPath: (path: string): TFile | TFolder | null =>
      filesByPath.get(path) ?? foldersByPath.get(path) ?? null,
  } as unknown as Vault;

  const metadataCache = {
    getFileCache: (file: TFile) => {
      const blockIds = options.blocksByFile?.[file.path] ?? [];
      return { blocks: Object.fromEntries(blockIds.map((id) => [id.toLowerCase(), {}])) };
    },
  } as unknown as MetadataCache;

  return new TaskFinder(vault, metadataCache, () => ({ ...BASE_SETTINGS, ...settings }));
}

describe('TaskFinder.filesInScope', () => {
  it('returns nothing when neither a location nor whole vault is configured', () => {
    const finder = finderWith({ files: ['Tasks.md'] });
    expect(finder.filesInScope()).toEqual([]);
  });

  it('returns nothing when the configured path does not resolve to a note or folder', () => {
    const finder = finderWith({ files: ['Tasks.md'] }, { relativeTaskSourcePath: 'Missing.md' });
    expect(finder.filesInScope()).toEqual([]);
  });

  it('returns just the one note when a single note is configured', () => {
    const finder = finderWith(
      { files: ['Tasks.md', 'Other.md'] },
      { relativeTaskSourcePath: 'Tasks.md' },
    );
    expect(finder.filesInScope().map((f) => f.path)).toEqual(['Tasks.md']);
  });

  it('returns every markdown file under a configured folder, recursively', () => {
    const finder = finderWith(
      { files: ['projects/Tasks.md', 'projects/nested/More.md', 'Other.md'], folders: ['projects'] },
      { relativeTaskSourcePath: 'projects' },
    );
    expect(finder.filesInScope().map((f) => f.path).sort()).toEqual([
      'projects/Tasks.md',
      'projects/nested/More.md',
    ]);
  });

  it('returns every markdown file in the vault when whole-vault sync is on', () => {
    const finder = finderWith({ files: ['a.md', 'b/c.md'] }, { syncWholeVault: true });
    expect(finder.filesInScope().map((f) => f.path).sort()).toEqual(['a.md', 'b/c.md']);
  });

  it('excludes a folder-scoped file matching the ignore pattern', () => {
    const finder = finderWith(
      { files: ['projects/Tasks.md', 'projects/Tasks.sync-conflict.md'], folders: ['projects'] },
      { relativeTaskSourcePath: 'projects', ignoreFilePatterns: '*.sync-conflict.md' },
    );
    expect(finder.filesInScope().map((f) => f.path)).toEqual(['projects/Tasks.md']);
  });

  it('excludes a whole-vault file matching the ignore pattern', () => {
    const finder = finderWith(
      { files: ['Tasks.md', 'Tasks.sync-conflict.md'] },
      { syncWholeVault: true, ignoreFilePatterns: '*.sync-conflict.md' },
    );
    expect(finder.filesInScope().map((f) => f.path)).toEqual(['Tasks.md']);
  });

  it('never excludes an explicitly selected single note, even if it matches the ignore pattern', () => {
    const finder = finderWith(
      { files: ['Tasks.md'] },
      { relativeTaskSourcePath: 'Tasks.md', ignoreFilePatterns: 'Tasks.md' },
    );
    expect(finder.filesInScope().map((f) => f.path)).toEqual(['Tasks.md']);
  });
});

describe('TaskFinder.isTagInScope', () => {
  it('accepts every task when no tag is configured', () => {
    const finder = finderWith({ files: [] });
    expect(finder.isTagInScope(parseTaskLine('- [ ] A')!)).toBe(true);
  });

  it('accepts a task carrying the configured tag', () => {
    const finder = finderWith({ files: [] }, { sourceTag: 'work' });
    expect(finder.isTagInScope(parseTaskLine('- [ ] A #work')!)).toBe(true);
  });

  it('rejects a task not carrying the configured tag', () => {
    const finder = finderWith({ files: [] }, { sourceTag: 'work' });
    expect(finder.isTagInScope(parseTaskLine('- [ ] A #personal')!)).toBe(false);
  });

  it('accepts a task whose tag stands inside its text rather than trailing it', () => {
    const finder = finderWith({ files: [] }, { sourceTag: 'work' });
    expect(finder.isTagInScope(parseTaskLine('- [ ] Call the #work dentist ^ots-a1')!)).toBe(true);
  });

  it('still rejects a # the text only reads as ordinary characters', () => {
    const finder = finderWith({ files: [] }, { sourceTag: 'work' });
    expect(finder.isTagInScope(parseTaskLine('- [ ] Read example.com/#work today')!)).toBe(false);
  });
});

describe('TaskFinder.existsOutsideIgnoredFiles', () => {
  it('finds a block id anchored in a non-ignored file', () => {
    const finder = finderWith({ files: ['Other.md'], blocksByFile: { 'Other.md': ['ots-abc123'] } });
    expect(finder.existsOutsideIgnoredFiles('ots-abc123')).toBe(true);
  });

  it('does not find a block id anchored nowhere', () => {
    const finder = finderWith({ files: ['Other.md'], blocksByFile: { 'Other.md': [] } });
    expect(finder.existsOutsideIgnoredFiles('ots-abc123')).toBe(false);
  });

  it('ignores a match inside a file matching the ignore pattern', () => {
    const finder = finderWith(
      { files: ['Tasks.sync-conflict.md'], blocksByFile: { 'Tasks.sync-conflict.md': ['ots-abc123'] } },
      { ignoreFilePatterns: '*.sync-conflict.md' },
    );
    expect(finder.existsOutsideIgnoredFiles('ots-abc123')).toBe(false);
  });

  it('matches case-insensitively', () => {
    const finder = finderWith({ files: ['Other.md'], blocksByFile: { 'Other.md': ['OTS-ABC123'] } });
    expect(finder.existsOutsideIgnoredFiles('ots-abc123')).toBe(true);
  });
});
