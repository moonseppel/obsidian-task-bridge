import { MetadataCache, TFile, TFolder, Vault } from 'obsidian';
import { matchesIgnorePattern } from '../../utils/ignore-pattern';
import { ParsedTaskLine } from './task-line';

export interface TaskFinderSettings {
  readonly relativeTaskSourcePath: string;
  readonly syncWholeVault: boolean;
  readonly sourceTag: string;
  readonly ignoreFilePatterns: string;
}

export type TaskFinderSettingsReader = () => TaskFinderSettings;

/**
 * Finds which tasks are currently in scope, from settings and vault state — the "finding" half of
 * the task-source module (see architecture-rules.md rules 29-33). Scope is derived fresh on every
 * call, never cached, since the vault can change between passes.
 */
export class TaskFinder {
  private readonly vault: Vault;
  private readonly metadataCache: MetadataCache;
  private readonly readSettings: TaskFinderSettingsReader;

  constructor(vault: Vault, metadataCache: MetadataCache, readSettings: TaskFinderSettingsReader) {
    this.vault = vault;
    this.metadataCache = metadataCache;
    this.readSettings = readSettings;
  }

  /**
   * Every markdown file in the configured note, folder or whole-vault scope, minus files matching
   * the ignore pattern. An explicitly selected single note is never excluded by the pattern.
   */
  filesInScope(): TFile[] {
    const settings = this.readSettings();

    if (settings.syncWholeVault) {
      return this.vault.getMarkdownFiles().filter((file) => !this.isIgnored(file, settings));
    }

    const location = this.resolveLocation(settings.relativeTaskSourcePath);

    if (location === undefined) {
      return [];
    }

    if (location instanceof TFile) {
      return [location];
    }

    return this.markdownFilesUnder(location).filter((file) => !this.isIgnored(file, settings));
  }

  /** Whether a task line passes the configured tag filter, independent of location scope. */
  isTagInScope(task: ParsedTaskLine): boolean {
    const tag = this.readSettings().sourceTag.trim();
    return tag.length === 0 || task.tags.includes(tag);
  }

  /**
   * Whether a block id is anchored anywhere in the vault, outside ignored files — used to tell a
   * task that merely moved out of scope from one that was genuinely deleted (rule 33).
   */
  existsOutsideIgnoredFiles(blockId: string): boolean {
    const settings = this.readSettings();
    const needle = blockId.toLowerCase();

    return this.vault
      .getMarkdownFiles()
      .filter((file) => !this.isIgnored(file, settings))
      .some((file) => this.hasBlockId(file, needle));
  }

  private resolveLocation(path: string): TFile | TFolder | undefined {
    if (path.length === 0) {
      return undefined;
    }

    const file = this.vault.getAbstractFileByPath(path);
    return file instanceof TFile || file instanceof TFolder ? file : undefined;
  }

  private markdownFilesUnder(folder: TFolder): TFile[] {
    return this.vault.getMarkdownFiles().filter((file) => isUnder(file, folder));
  }

  private isIgnored(file: TFile, settings: TaskFinderSettings): boolean {
    return matchesIgnorePattern(file.name, settings.ignoreFilePatterns);
  }

  private hasBlockId(file: TFile, lowercasedBlockId: string): boolean {
    const blocks = this.metadataCache.getFileCache(file)?.blocks;
    return blocks !== undefined && lowercasedBlockId in blocks;
  }
}

function isUnder(file: TFile, folder: TFolder): boolean {
  return file.path === folder.path || file.path.startsWith(`${folder.path}/`);
}
