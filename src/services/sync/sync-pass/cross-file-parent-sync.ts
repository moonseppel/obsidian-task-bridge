import { Logger } from '../../../utils/logger';
import { DEFAULT_INDENTATION, Indentation } from '../task-format/indentation';
import { NoteEdits } from '../note-access/note-edits';
import { PendingRelocation } from './sync-pass';
import { SourceNote } from '../note-access/source-note';
import { leadingWhitespace } from '../task-format/task-description';
import { parseTaskLine } from '../task-format/task-line';
import { TaskLink, TaskLinkStore, linkIds } from '../sync-state/task-links';
import { reindentBlock, subtreeSpan, taskLineNumbers } from '../task-format/task-tree';

const logger = new Logger('TaskBridge:Sync');

export interface CrossFileParentSyncDependencies {
  readonly links: TaskLinkStore;
  readonly noteFor: (path: string) => SourceNote;
}

/** Where a queued relocation's task line and new parent were found once both files were read fresh. */
interface LocatedRelocation extends PendingRelocation {
  readonly link: TaskLink;
  readonly source: readonly string[];
  readonly taskLineNumber: number;
  readonly target: readonly string[];
  readonly newParentLineNumber: number;
}

/**
 * Applies a remote reparent whose new parent lives in a different in-scope file than the task's
 * own line — queued by `ParentSync` during each file's own pass, applied once per whole run after
 * every file has committed its normal edits, so the target file is read post-commit rather than
 * from a stale snapshot. Runs the two writes it needs in the order that bounds any failure between
 * them to a harmless, self-correcting duplicate rather than losing the task's content: insert into
 * the target first, and only remove it from the source once that insert is confirmed to have
 * landed. Reuses `subtreeSpan`/`reindentBlock` (task-tree.ts) verbatim — the same primitives the
 * same-file relocation in `EditableLines.moveUnder` already carries a task's description and
 * nested children along with, so both move together here too, automatically.
 */
export class CrossFileParentSync {
  private readonly links: TaskLinkStore;
  private readonly noteFor: (path: string) => SourceNote;

  constructor(dependencies: CrossFileParentSyncDependencies) {
    this.links = dependencies.links;
    this.noteFor = dependencies.noteFor;
  }

  /** Resolves to how many relocations actually landed, for the run's `pulled` count. */
  async run(pending: readonly PendingRelocation[], indentation = DEFAULT_INDENTATION): Promise<number> {
    let relocated = 0;

    for (const relocation of pending) {
      const located = await this.locate(relocation, indentation);

      if (located !== undefined && (await this.relocate(located, indentation))) {
        relocated += 1;
      }
    }

    return relocated;
  }

  /** Re-resolves everything fresh: the pass that queued this may be long committed by now. */
  private async locate(
    relocation: PendingRelocation,
    indentation: Indentation,
  ): Promise<LocatedRelocation | undefined> {
    const { blockId, sourcePath, targetPath, newParentBlockId } = relocation;
    const link = this.links.get(blockId);

    // Resolved, re-linked or dropped by something else since this was queued earlier in the run.
    if (link === undefined) {
      return undefined;
    }

    const target = await this.readLines(targetPath);
    const newParentLineNumber = findLineNumber(target, newParentBlockId, indentation);

    if (newParentLineNumber === undefined) {
      logger.debug('New parent no longer has a line in its file; relocation retried next run', {
        ...linkIds(link),
        newParentBlockId,
        targetPath,
      });
      return undefined;
    }

    const source = await this.readLines(sourcePath);
    const taskLineNumber = findLineNumber(source, blockId, indentation);

    if (taskLineNumber === undefined) {
      logger.debug('Line moved or vanished from its file before the relocation could run', {
        ...linkIds(link),
        sourcePath,
      });
      return undefined;
    }

    return { ...relocation, link, source, taskLineNumber, target, newParentLineNumber };
  }

  /** Insert first, remove second: a failure between the two leaves a duplicate, never a loss. */
  private async relocate(located: LocatedRelocation, indentation: Indentation): Promise<boolean> {
    const { link, source, taskLineNumber, target, newParentLineNumber, sourcePath, targetPath, newParentBlockId } = located;
    const span = subtreeSpan(source, taskLineNumber, indentation);
    const captured = source.slice(taskLineNumber, span.endLineExclusive);
    const rebased = reindentBlock(captured, leadingWhitespace(captured[0]), `${leadingWhitespace(target[newParentLineNumber])}\t`);

    const insertSkipped = await this.noteFor(targetPath).applyEdits(
      insertUnderEdit(newParentLineNumber, target[newParentLineNumber], rebased),
      indentation,
    );

    if (insertSkipped > 0) {
      logger.debug('New parent line changed before the relocation could land; retried next run', { ...linkIds(link), targetPath });
      return false;
    }

    const removeSkipped = await this.noteFor(sourcePath).applyEdits(
      removalEdit(source, taskLineNumber, captured.length),
      indentation,
    );

    this.links.set({ ...link, lastSyncedParentBlockId: newParentBlockId, lastKnownFilePath: targetPath });

    if (removeSkipped > 0) {
      logger.warn('Could not remove the relocated line from its old note; a duplicate remains until the next run', {
        ...linkIds(link),
        sourcePath,
        targetPath,
      });
    } else {
      logger.info('Moved a task line to the note its new remote parent lives in', { ...linkIds(link), sourcePath, targetPath });
    }

    return true;
  }

  private async readLines(path: string): Promise<string[]> {
    return (await this.noteFor(path).read()).split('\n');
  }
}

function findLineNumber(lines: readonly string[], blockId: string, indentation: Indentation): number | undefined {
  return [...taskLineNumbers(lines, indentation)].find(
    (lineNumber) => parseTaskLine(lines[lineNumber])?.blockId === blockId,
  );
}

function insertUnderEdit(anchorLineNumber: number, expectedAnchorLine: string, lines: readonly string[]): NoteEdits {
  return {
    replacements: [],
    removals: [],
    blocks: [],
    structure: [{ kind: 'insert-under', anchor: { lineNumber: anchorLineNumber, expected: expectedAnchorLine }, lines }],
    appended: [],
  };
}

function removalEdit(lines: readonly string[], startLine: number, lineCount: number): NoteEdits {
  const removals = Array.from({ length: lineCount }, (_, offset) => ({
    lineNumber: startLine + offset,
    expected: lines[startLine + offset],
  }));

  return { replacements: [], removals, blocks: [], structure: [], appended: [] };
}
