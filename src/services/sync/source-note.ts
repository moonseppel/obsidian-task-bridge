import { NoteEdits } from './note-edits';

export interface SourceNote {
  read(): Promise<string>;
  /** Epoch ms the note was last modified, so a conflict can be resolved by recency. */
  lastModified(): Promise<number>;
  /** Resolves to how many edits were left unwritten because a line they depend on changed meanwhile. */
  applyEdits(edits: NoteEdits): Promise<number>;
}
