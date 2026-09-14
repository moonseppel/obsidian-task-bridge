import { TFile, Vault } from 'obsidian';
import { appendAnchorToLine } from './anchor-write';
import { NoteEdits, applyNoteEdits, countSkippedEdits } from './note-edits';
import { SourceNote } from './source-note';

export type SourceFileReader = () => TFile | undefined;

/** Reads and writes the configured note, resolving it lazily so a rename mid-session is picked up. */
export class ObsidianSourceNote implements SourceNote {
  private readonly vault: Vault;
  private readonly readFile: SourceFileReader;

  constructor(vault: Vault, readFile: SourceFileReader) {
    this.vault = vault;
    this.readFile = readFile;
  }

  async read(): Promise<string> {
    return this.vault.read(this.requireFile());
  }

  async lastModified(): Promise<number> {
    return this.requireFile().stat.mtime;
  }

  async applyEdits(edits: NoteEdits): Promise<number> {
    let skipped = 0;

    // `process` rather than `modify`, so a concurrent write cannot lose either side's changes.
    await this.vault.process(this.requireFile(), (content) => {
      skipped = countSkippedEdits(content, edits);
      return applyNoteEdits(content, edits);
    });

    return skipped;
  }

  async appendAnchorIfMissing(lineNumber: number, blockId: string): Promise<boolean> {
    let appended = false;

    // `process` rather than `modify`, for the same concurrency safety as applyEdits above.
    await this.vault.process(this.requireFile(), (content) => {
      const result = appendAnchorToLine(content, lineNumber, blockId);
      appended = result.appended;
      return result.content;
    });

    return appended;
  }

  private requireFile(): TFile {
    const file = this.readFile();

    if (file === undefined) {
      throw new Error('The task source note disappeared while syncing.');
    }

    return file;
  }
}
