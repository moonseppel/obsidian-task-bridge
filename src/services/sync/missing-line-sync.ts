import { Logger } from '../../utils/logger';
import { ProviderTask, TaskProvider } from '../task-provider';
import { GracePeriod } from './grace-period';
import { appendingOnly } from './note-edits';
import { ResolvedProject } from './project-resolver';
import { promoteChildrenToTopLevel } from './reparent-children';
import { SourceNote } from './source-note';
import { SyncOutcome, emptyOutcome } from './sync-outcome';
import { indexTasksById } from './task-index';
import { formatTaskLine } from './task-line';
import { TaskLink, TaskLinkStore, linkIds } from './task-links';

const logger = new Logger('ObsidianTaskSync:Sync');

/** The original marker (bullet vs. numbered, checked vs. not) is gone and cannot be restored. */
const RESURRECTED_LINE_PREFIX = '- ';
const RESURRECTED_LINE_CHECKBOX = ' ';

export interface MissingLineSyncDependencies {
  readonly provider: TaskProvider;
  readonly links: TaskLinkStore;
  readonly grace: GracePeriod;
  readonly noteFor: (path: string) => SourceNote;
  /** Whether a block id still anchors a task line in a non-ignored vault file outside this run's scope. */
  readonly existsOutsideIgnoredFiles: (blockId: string) => boolean;
}

export interface MissingLineRunContext {
  readonly project: ResolvedProject;
  /** Every block id anchoring a task line in any file scanned this run, across every file. */
  readonly takenBlockIds: ReadonlySet<string>;
  /** This run's scanned file paths, so a link that has never been seen still has an unambiguous
   *  resurrection target when there is only ever one file it could have come from. */
  readonly scannedPaths: readonly string[];
}

interface MissingLineSweep extends MissingLineRunContext {
  readonly remoteTasks: ReadonlyMap<string, ProviderTask>;
  readonly outcome: SyncOutcome;
}

/** A link whose line has vanished while its task is still in the project's active list. */
interface MissingLine {
  readonly link: TaskLink;
  readonly remoteTask: ProviderTask;
}

/**
 * Walks every stored link, not any file's lines: a deleted line is exactly one no scanned file
 * still has. Runs once per whole run rather than once per file, since a link's block id may have
 * moved to a different file within the same scope without ever truly vanishing.
 */
export class MissingLineSync {
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly grace: GracePeriod;
  private readonly noteFor: (path: string) => SourceNote;
  private readonly existsOutsideIgnoredFiles: (blockId: string) => boolean;

  constructor(dependencies: MissingLineSyncDependencies) {
    this.provider = dependencies.provider;
    this.links = dependencies.links;
    this.grace = dependencies.grace;
    this.noteFor = dependencies.noteFor;
    this.existsOutsideIgnoredFiles = dependencies.existsOutsideIgnoredFiles;
  }

  async run(context: MissingLineRunContext): Promise<SyncOutcome> {
    const sweep: MissingLineSweep = {
      ...context,
      remoteTasks: indexTasksById(context.project.tasks),
      outcome: emptyOutcome(context.project.resolution),
    };

    for (const link of [...this.links.values()]) {
      await this.sweepLink(sweep, link);
    }

    this.grace.sweep();
    return sweep.outcome;
  }

  private async sweepLink(sweep: MissingLineSweep, link: TaskLink): Promise<void> {
    if (sweep.takenBlockIds.has(link.blockId)) {
      return;
    }

    if (this.grace.isPending(link.blockId)) {
      logger.debug('Line missing from every scanned note; waiting out the grace period', linkIds(link));
      return;
    }

    await this.resolve(sweep, link);
  }

  /** A vanished line says nothing about the task, so the task is checked rather than assumed gone. */
  private async resolve(sweep: MissingLineSweep, link: TaskLink): Promise<void> {
    const remoteTask = sweep.remoteTasks.get(link.providerTaskId);

    if (remoteTask === undefined) {
      await this.resolveAgainstAbsentTask(sweep, link);
      return;
    }

    // Still anchored outside the configured scope: orphan housekeeping flags and removes it on its own
    // timing, the same way re-entering scope resolves an orphan.
    if (this.existsOutsideIgnoredFiles(link.blockId)) {
      logger.debug('Line moved out of scope; left to orphan housekeeping', linkIds(link));
      return;
    }

    if (remoteTask.title.length > 0 && remoteTask.title !== link.lastSyncedTitle) {
      await this.resolveConflict(sweep, { link, remoteTask });
      return;
    }

    await this.removeTask(sweep, link);
  }

  /** Moved out of this project is left untouched; completed here is tidied up like a deletion. */
  private async resolveAgainstAbsentTask(sweep: MissingLineSweep, link: TaskLink): Promise<void> {
    const found = await this.provider.getTask(link.providerTaskId);

    if (found === undefined) {
      logger.debug('Line and task are both gone; dropping the link', linkIds(link));
      this.links.delete(link.blockId);
      return;
    }

    if (found.projectId === sweep.project.id && found.isCompleted) {
      await this.removeTask(sweep, link);
      return;
    }

    logger.debug('Line gone while its task is still active elsewhere; left alone', linkIds(link));
  }

  /**
   * Deleting a line touches its file's mtime like any other edit, so the file the block id was
   * last known to live in stands in for when the deletion happened. With no such file recorded —
   * or one that has since vanished entirely — there is nowhere to resurrect a line into, so the
   * deletion stands rather than guessing a location.
   */
  private async resolveConflict(sweep: MissingLineSweep, missing: MissingLine): Promise<void> {
    sweep.outcome.conflicted += 1;
    const path = missing.link.lastKnownFilePath ?? soleScannedPath(sweep.scannedPaths);

    if (path === undefined || !(await this.isRemoteNewerThanNote(missing.remoteTask, path))) {
      await this.removeTask(sweep, missing.link);
      return;
    }

    await this.resurrectLine(missing, path);
    sweep.outcome.resurrectedLine += 1;
  }

  private async isRemoteNewerThanNote(remoteTask: ProviderTask, path: string): Promise<boolean> {
    if (remoteTask.updatedAt === undefined) {
      return false;
    }

    try {
      return remoteTask.updatedAt > (await this.noteFor(path).lastModified());
    } catch {
      logger.debug('Note the line was last seen in is gone; the deletion stands', { path });
      return false;
    }
  }

  private async resurrectLine(missing: MissingLine, path: string): Promise<void> {
    const { link, remoteTask } = missing;
    const resurrected = formatTaskLine({
      prefix: RESURRECTED_LINE_PREFIX,
      checkbox: RESURRECTED_LINE_CHECKBOX,
      title: remoteTask.title,
      tags: [],
      blockId: link.blockId,
    });

    await this.noteFor(path).applyEdits(appendingOnly([resurrected]));
    this.links.set({ ...link, lastSyncedTitle: remoteTask.title, lastKnownFilePath: path });
    logger.debug('Remote edit is newer than the line deletion; resurrected the line', { ...linkIds(link), path });
  }

  private async removeTask(sweep: MissingLineSweep, link: TaskLink): Promise<void> {
    logger.debug('Removing the task of a line deleted from its note', linkIds(link));
    await promoteChildrenToTopLevel(this.provider, sweep.project, link.providerTaskId);
    await this.provider.removeTask(link.providerTaskId);
    this.links.delete(link.blockId);
    sweep.outcome.removedTask += 1;
  }
}

/** Unambiguous only when scope resolves to exactly one file. */
function soleScannedPath(scannedPaths: readonly string[]): string | undefined {
  return scannedPaths.length === 1 ? scannedPaths[0] : undefined;
}
