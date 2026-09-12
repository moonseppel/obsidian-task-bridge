import { NoteEdits } from './note-edits';

export interface SourceNote {
  read(): Promise<string>;
  /** Epoch ms the note was last modified, so a conflict can be resolved by recency. */
  lastModified(): Promise<number>;
  applyEdits(edits: NoteEdits): Promise<void>;
}
