import { NoteEdits } from './note-edits';

export interface SourceNote {
  read(): Promise<string>;
  /** Epoch ms the note was last modified, so a conflict can be resolved by recency. */
  lastModified(): Promise<number>;
  /** Resolves to how many edits were left unwritten because a line they depend on changed meanwhile. */
  applyEdits(edits: NoteEdits): Promise<number>;
  /**
   * Appends a block id to the line at this position, unless it has already moved on from being a
   * bare, anchor-less task line. Resolves to whether the anchor actually landed.
   */
  appendAnchorIfMissing(lineNumber: number, blockId: string): Promise<boolean>;
}
