import { GracePeriod } from '../sync-state/grace-period';
import { TaskLinkStore } from '../sync-state/task-links';

/** One in-scope task line anchored by a block id, as one run's scan found it. */
export interface AnchorOccurrence {
  readonly path: string;
  readonly lineNumber: number;
}

/** What one run decided about a block id more than one of its task lines carried. */
export interface DuplicatedAnchor {
  readonly blockId: string;
  readonly keeper: AnchorOccurrence;
  readonly copies: readonly AnchorOccurrence[];
}

/**
 * Which line a block id has always belonged to, and which lines merely copied it. Files are synced
 * one at a time, so no single file's pass can tell whether another file carries the same id: the
 * census is built across the whole run and the decision is carried into the next one, the way
 * `GracePeriod` already lets a sighting in one pass be acted on in a later one. Bookkeeping only,
 * held for the plugin's lifetime and in memory alone — a duplicate that stops appearing should be
 * forgotten rather than tracked forever in `data.json`.
 *
 * One accepted wrinkle: on the run where a duplicate resolves itself and the surviving line is not
 * in the remembered keeper path, that line reads as a copy and is skipped for one run. Nothing is
 * lost — `endRun` sees a single occurrence, forgets the id, and the next run syncs it normally.
 */
export class DuplicateAnchors {
  private readonly links: TaskLinkStore;
  private readonly grace: GracePeriod;
  private occurrences = new Map<string, AnchorOccurrence[]>();
  /**
   * Where each id's link said it last lived, read the moment this run first sights the id: a file's
   * own pass records its path as soon as it commits, so by the end of a run a copy read first would
   * already have claimed it.
   */
  private lastKnownPaths = new Map<string, string>();
  /** From the last completed run, so the first line a run reads can already be known as a copy. */
  private keeperPathByBlockId = new Map<string, string>();

  constructor(links: TaskLinkStore, grace: GracePeriod) {
    this.links = links;
    this.grace = grace;
  }

  startRun(): void {
    this.occurrences = new Map();
    this.lastKnownPaths = new Map();
  }

  /** Records this line and answers in the same breath whether it may be synced, so the two can never disagree. */
  noteOccurrence(blockId: string, path: string, lineNumber: number): 'keeper' | 'copy' {
    const seen = this.occurrences.get(blockId) ?? [];
    const verdict = this.verdict(blockId, path, seen);

    if (seen.length === 0) {
      this.rememberLastKnownPath(blockId);
    }

    this.occurrences.set(blockId, [...seen, { path, lineNumber }]);

    return verdict;
  }

  /**
   * Closes the census: every id more than one line carried keeps its keeper for the next run, and
   * is handed back for re-minting once it has looked that way for the whole grace period. An id
   * down to a single line is forgotten, and its grace starts over should it ever come back.
   */
  endRun(): DuplicatedAnchor[] {
    const duplicated: DuplicatedAnchor[] = [];
    const keeperPaths = new Map<string, string>();

    for (const [blockId, occurrences] of this.occurrences) {
      if (occurrences.length < 2) {
        continue;
      }

      const keeper = this.keeperOf(blockId, occurrences);
      keeperPaths.set(blockId, keeper.path);

      if (!this.grace.isPending(blockId)) {
        duplicated.push({ blockId, keeper, copies: occurrences.filter((occurrence) => occurrence !== keeper) });
      }
    }

    this.grace.sweep();
    this.keeperPathByBlockId = keeperPaths;

    return duplicated;
  }

  private verdict(blockId: string, path: string, seen: readonly AnchorOccurrence[]): 'keeper' | 'copy' {
    const keeperPath = this.keeperPathByBlockId.get(blockId);

    if (keeperPath === undefined) {
      return seen.length === 0 ? 'keeper' : 'copy';
    }

    return path === keeperPath && !seen.some((occurrence) => occurrence.path === path) ? 'keeper' : 'copy';
  }

  private rememberLastKnownPath(blockId: string): void {
    const lastKnownFilePath = this.links.get(blockId)?.lastKnownFilePath;

    if (lastKnownFilePath !== undefined) {
      this.lastKnownPaths.set(blockId, lastKnownFilePath);
    }
  }

  /**
   * The line the id has always belonged to: the first one in the file already settled on as its
   * keeper, else in the file the link last knew it in, since the original task carries everything
   * the provider knows about it that this plugin never syncs. A decision once taken outranks the
   * link, which the run that discovered the duplicate may have pointed at the copy before it knew
   * any better. Scan order is the fallback, for an id neither of the two names a file for.
   */
  private keeperOf(blockId: string, occurrences: readonly AnchorOccurrence[]): AnchorOccurrence {
    const remembered = this.keeperPathByBlockId.get(blockId) ?? this.lastKnownPaths.get(blockId);

    return occurrences.find((occurrence) => occurrence.path === remembered) ?? occurrences[0];
  }
}
