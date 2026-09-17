import { Logger } from '../../../utils/logger';
import { createBlockId } from '../task-format/block-id';
import { DEFAULT_INDENTATION, Indentation } from '../task-format/indentation';
import { DuplicatedAnchor } from './duplicate-anchors';
import { LineEdit } from '../note-access/note-edits';
import { SourceNote } from '../note-access/source-note';
import { collectBlockIds, formatTaskLine, parseTaskLine } from '../task-format/task-line';
import { taskLineNumbers } from '../task-format/task-tree';

const logger = new Logger('TaskBridge:Sync');

export interface CopiedLineSyncDependencies {
  readonly noteFor: (path: string) => SourceNote;
  readonly getDeviceTag: () => string;
}

/** What one sweep got done, in the two counters the run reports it by. */
export interface RemintedCopies {
  readonly remintedCopies: number;
  readonly skippedEdits: number;
}

/** One file's re-minting: which of its task lines merely copied an id, found in its current content. */
interface CopiedLines {
  readonly lines: readonly string[];
  readonly edits: LineEdit[];
  readonly taken: Set<string>;
  remintedAnchors: number;
}

/**
 * Gives every line that merely copied a block id one of its own, so it can become a task of its
 * own. Modelled on `CrossFileParentSync`: a run-level sweep that re-reads each file fresh once
 * every file's own pass has committed, and writes through `SourceNote.applyEdits`, so each rewrite
 * is guarded on the line still reading as the pass left it. Nothing else about a re-minted line
 * changes — its text, its indentation, its description and everything nested under it are left
 * exactly as they are, since only the anchor is rewritten.
 *
 * Creating the task is deliberately not done here. A re-minted line is simply a task line whose
 * block id `data.json` does not recognize, which is what every freshly written task line is, so
 * `TaskSync` picks it up on a later run and `LineLinker` creates its task once the creation grace
 * period has passed — the ordinary path, undo logic and all.
 */
export class CopiedLineSync {
  private readonly noteFor: (path: string) => SourceNote;
  private readonly getDeviceTag: () => string;

  constructor(dependencies: CopiedLineSyncDependencies) {
    this.noteFor = dependencies.noteFor;
    this.getDeviceTag = dependencies.getDeviceTag;
  }

  /** Resolves to how many copied anchors got an id of their own, and how many edits went unwritten. */
  async run(duplicates: readonly DuplicatedAnchor[], indentation = DEFAULT_INDENTATION): Promise<RemintedCopies> {
    let remintedCopies = 0;
    let skippedEdits = 0;

    for (const [path, anchors] of groupByCopiedFile(duplicates)) {
      const file = await this.remintFile(path, anchors, indentation);

      remintedCopies += file.remintedCopies;
      skippedEdits += file.skippedEdits;
    }

    return { remintedCopies, skippedEdits };
  }

  private async remintFile(
    path: string,
    anchors: readonly DuplicatedAnchor[],
    indentation: Indentation,
  ): Promise<RemintedCopies> {
    const lines = (await this.noteFor(path).read()).split('\n');
    const file: CopiedLines = { lines, edits: [], taken: collectBlockIds(lines), remintedAnchors: 0 };
    const taskLines = [...taskLineNumbers(lines, indentation)];

    for (const anchor of anchors) {
      this.remintAnchor(file, anchor, path, taskLines);
    }

    const skippedEdits = await this.write(file, path, indentation);

    return { remintedCopies: file.remintedAnchors - skippedEdits, skippedEdits };
  }

  /**
   * Finds the anchor's lines in the file as it reads now rather than trusting the line numbers the
   * run recorded, which the file's own committed edits may since have shifted. Where this is the
   * keeper's own file the first of them is the line the id belongs to, so only the rest are copies.
   */
  private remintAnchor(file: CopiedLines, anchor: DuplicatedAnchor, path: string, taskLines: readonly number[]): void {
    const carrying = taskLines.filter((lineNumber) => parseTaskLine(file.lines[lineNumber])?.blockId === anchor.blockId);
    const copies = anchor.keeper.path === path ? carrying.slice(1) : carrying;

    for (const lineNumber of copies) {
      this.remintLine(file, anchor.blockId, path, lineNumber);
    }
  }

  private remintLine(file: CopiedLines, blockId: string, path: string, lineNumber: number): void {
    const task = parseTaskLine(file.lines[lineNumber]);

    if (task === undefined) {
      return;
    }

    const newBlockId = createBlockId(file.taken, this.getDeviceTag());
    file.taken.add(newBlockId);
    file.edits.push({
      lineNumber,
      expected: file.lines[lineNumber],
      replacement: formatTaskLine({ ...task, blockId: newBlockId }),
    });
    file.remintedAnchors += 1;
    logger.info('Gave a copied task line a block id of its own', { blockId, newBlockId, path });
  }

  /** A skipped edit means the line changed underneath; the copy is still a copy next run and is retried. */
  private async write(file: CopiedLines, path: string, indentation: Indentation): Promise<number> {
    if (file.edits.length === 0) {
      return 0;
    }

    const skipped = await this.noteFor(path).applyEdits(
      { replacements: file.edits, removals: [], blocks: [], structure: [], appended: [] },
      indentation,
    );

    if (skipped > 0) {
      logger.debug('A copied task line changed before its new block id could land; retried next run', {
        path,
        skipped,
      });
    }

    return skipped;
  }
}

/** Every anchor with a copy in a file, keyed by that file, so each one is read and written once. */
function groupByCopiedFile(duplicates: readonly DuplicatedAnchor[]): Map<string, DuplicatedAnchor[]> {
  const byPath = new Map<string, DuplicatedAnchor[]>();

  for (const anchor of duplicates) {
    for (const path of new Set(anchor.copies.map((copy) => copy.path))) {
      byPath.set(path, [...(byPath.get(path) ?? []), anchor]);
    }
  }

  return byPath;
}
