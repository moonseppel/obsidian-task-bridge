import { TFile, Vault } from 'obsidian';
import { NoteEdits, applyNoteEdits } from './note-edits';
import { SourceNote } from './source-note';

export type SourceFileReader = () => TFile | null;

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

  async applyEdits(edits: NoteEdits): Promise<void> {
    // `process` rather than `modify`, so a concurrent write cannot lose either side's changes.
    await this.vault.process(this.requireFile(), (content) => applyNoteEdits(content, edits));
  }

  private requireFile(): TFile {
    const file = this.readFile();

    if (file === null) {
      throw new Error('The task source note disappeared while syncing.');
    }

    return file;
  }
}
