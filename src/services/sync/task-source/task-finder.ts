import { TFile, TFolder, Vault } from 'obsidian';
import { matchesIgnorePattern } from '../../../utils/ignore-pattern';
import { ParsedTaskLine, collectBlockIds } from '../task-format/task-line';

export interface TaskFinderSettings {
  readonly relativeTaskSourcePath: string;
  readonly syncWholeVault: boolean;
  readonly sourceTag: string;
  readonly ignoreFilePatterns: string;
}

export type TaskFinderSettingsReader = () => TaskFinderSettings;

export interface TaskFinderScopeDescription {
  readonly location: string;
  readonly wholeVault: boolean;
  readonly tagFilter: boolean;
  readonly ignorePatterns: string;
}

/**
 * Finds which tasks are currently in scope, from settings and vault state — the "finding" half of
 * the task-source module (see architecture-rules.md rules 27-31). Scope is derived fresh on every
 * call, never cached, since the vault can change between passes.
 */
export class TaskFinder {
  private readonly vault: Vault;
  private readonly readSettings: TaskFinderSettingsReader;

  constructor(vault: Vault, readSettings: TaskFinderSettingsReader) {
    this.vault = vault;
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

  /**
   * The settings this scope is resolved from, for the log. The filter tag is only said to be set,
   * never named, since a tag is never logged.
   */
  describeScope(): TaskFinderScopeDescription {
    const settings = this.readSettings();

    return {
      location: settings.relativeTaskSourcePath,
      wholeVault: settings.syncWholeVault,
      tagFilter: settings.sourceTag.trim().length > 0,
      ignorePatterns: settings.ignoreFilePatterns,
    };
  }

  /** Whether a task line passes the configured tag filter, independent of location scope. */
  isTagInScope(task: ParsedTaskLine): boolean {
    const tag = this.readSettings().sourceTag.trim();
    return tag.length === 0 || task.tags.includes(tag);
  }

  /**
   * Whether a block id is anchored anywhere in the vault, outside ignored files — used to tell a
   * task that merely moved out of scope from one that was genuinely deleted (rule 31).
   */
  async existsOutsideIgnoredFiles(blockId: string): Promise<boolean> {
    const settings = this.readSettings();
    const files = this.vault.getMarkdownFiles().filter((file) => !this.isIgnored(file, settings));

    return (await this.firstAnchoring(files, blockId)) !== undefined;
  }

  /** Which in-scope file currently anchors a block id, if any — used to relocate a task whose
   *  remote parent lives in a different note than its own line. */
  locateBlockId(blockId: string): Promise<TFile | undefined> {
    return this.firstAnchoring(this.filesInScope(), blockId);
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

  /**
   * Read from the content by the sync's own rule rather than Obsidian's metadata cache, which drops a
   * list item's `^id` once plain indented text continues its paragraph — a line the sync still reads
   * as a task with a description, and whose task would otherwise be deleted as gone.
   */
  private async firstAnchoring(files: readonly TFile[], blockId: string): Promise<TFile | undefined> {
    const needle = blockId.toLowerCase();

    for (const file of files) {
      const lines = (await this.vault.cachedRead(file)).split('\n');

      if ([...collectBlockIds(lines)].some((found) => found.toLowerCase() === needle)) {
        return file;
      }
    }

    return undefined;
  }
}

function isUnder(file: TFile, folder: TFolder): boolean {
  return file.path === folder.path || file.path.startsWith(`${folder.path}/`);
}
