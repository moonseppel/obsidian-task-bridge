import { TFile, TFolder, Vault } from 'obsidian';
import { TaskFinder, TaskFinderSettings } from '../../../../services/sync/task-source/task-finder';
import { parseTaskLine } from '../../../../services/sync/task-format/task-line';

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
  contentByFile?: Record<string, string>;
}

function finderWith(options: FakeVaultOptions, settings: Partial<TaskFinderSettings> = {}): TaskFinder {
  const files = options.files.map(tfile);
  const foldersByPath = new Map<string, TFolder>((options.folders ?? []).map((path) => [path, tfolder(path)]));
  const filesByPath = new Map<string, TFile>(files.map((file) => [file.path, file]));

  const vault = {
    getMarkdownFiles: (): TFile[] => files,
    getAbstractFileByPath: (path: string): TFile | TFolder | null =>
      filesByPath.get(path) ?? foldersByPath.get(path) ?? null,
    cachedRead: (file: TFile): Promise<string> => Promise.resolve(options.contentByFile?.[file.path] ?? ''),
  } as unknown as Vault;

  return new TaskFinder(vault, () => ({ ...BASE_SETTINGS, ...settings }));
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
    expect(finder.isTagInScope(parseTaskLine('- [ ] Call the #work dentist ^tb-a1')!)).toBe(true);
  });

  it('still rejects a # the text only reads as ordinary characters', () => {
    const finder = finderWith({ files: [] }, { sourceTag: 'work' });
    expect(finder.isTagInScope(parseTaskLine('- [ ] Read example.com/#work today')!)).toBe(false);
  });
});

describe('TaskFinder.describeScope', () => {
  it('reports the scope settings, saying only whether a filter tag is set rather than naming it', () => {
    const finder = finderWith(
      { files: [] },
      { relativeTaskSourcePath: 'Tasks', sourceTag: 'private-tag', ignoreFilePatterns: '*.conflict.md' },
    );

    expect(finder.describeScope()).toEqual({
      location: 'Tasks',
      wholeVault: false,
      tagFilter: true,
      ignorePatterns: '*.conflict.md',
    });
  });
});

describe('TaskFinder.existsOutsideIgnoredFiles', () => {
  it('finds a block id anchored in a non-ignored file', async () => {
    const finder = finderWith({ files: ['Other.md'], contentByFile: { 'Other.md': '- [ ] Buy milk ^tb-abc123' } });
    expect(await finder.existsOutsideIgnoredFiles('tb-abc123')).toBe(true);
  });

  it('does not find a block id anchored nowhere', async () => {
    const finder = finderWith({ files: ['Other.md'], contentByFile: { 'Other.md': '- [ ] Buy milk' } });
    expect(await finder.existsOutsideIgnoredFiles('tb-abc123')).toBe(false);
  });

  it('ignores a match inside a file matching the ignore pattern', async () => {
    const finder = finderWith(
      { files: ['Tasks.sync-conflict.md'], contentByFile: { 'Tasks.sync-conflict.md': '- [ ] Buy milk ^tb-abc123' } },
      { ignoreFilePatterns: '*.sync-conflict.md' },
    );
    expect(await finder.existsOutsideIgnoredFiles('tb-abc123')).toBe(false);
  });

  it('matches case-insensitively', async () => {
    const finder = finderWith({ files: ['Other.md'], contentByFile: { 'Other.md': '- [ ] Buy milk ^TB-ABC123' } });
    expect(await finder.existsOutsideIgnoredFiles('tb-abc123')).toBe(true);
  });

  it('finds a task line whose paragraph plain indented text continues, which Obsidian indexes no block id for', async () => {
    const content = '- [x] Buy milk  ^tb-abc123\n\tanother description without bullet point';
    const finder = finderWith({ files: ['Other.md'], contentByFile: { 'Other.md': content } });
    expect(await finder.existsOutsideIgnoredFiles('tb-abc123')).toBe(true);
  });

  it('finds a task line followed by a child indented too deep to start a nested list', async () => {
    const content = '- [ ] another nesting test ^tb-abc123\n\t\t- [ ] direct grandchild';
    const finder = finderWith({ files: ['Other.md'], contentByFile: { 'Other.md': content } });
    expect(await finder.existsOutsideIgnoredFiles('tb-abc123')).toBe(true);
  });

  it('still finds a block id carried by description text, so its task takes the out-of-scope path', async () => {
    const content = '- [ ] Parent ^tb-p1\n\tDemoted text ^tb-abc123';
    const finder = finderWith({ files: ['Other.md'], contentByFile: { 'Other.md': content } });
    expect(await finder.existsOutsideIgnoredFiles('tb-abc123')).toBe(true);
  });
});

describe('TaskFinder.locateBlockId', () => {
  it('names the in-scope file whose content anchors the block id', async () => {
    const finder = finderWith(
      {
        files: ['Tasks/A.md', 'Tasks/B.md'],
        folders: ['Tasks'],
        contentByFile: { 'Tasks/A.md': '- [ ] Other ^tb-x1', 'Tasks/B.md': '- [ ] Parent ^tb-abc123\n\tplain text' },
      },
      { relativeTaskSourcePath: 'Tasks' },
    );
    expect((await finder.locateBlockId('tb-abc123'))?.path).toBe('Tasks/B.md');
  });

  it('does not look outside the configured scope', async () => {
    const finder = finderWith(
      { files: ['Tasks/A.md', 'Other.md'], folders: ['Tasks'], contentByFile: { 'Other.md': '- [ ] Parent ^tb-abc123' } },
      { relativeTaskSourcePath: 'Tasks' },
    );
    expect(await finder.locateBlockId('tb-abc123')).toBeUndefined();
  });
});
