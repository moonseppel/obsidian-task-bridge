import { ProviderTask, TaskProvider } from '../task-provider';
import { GracePeriod } from './grace-period';
import { ResolvedProject } from './project-resolver';
import { promoteChildrenToTopLevel } from './reparent-children';
import { SourceNote } from './source-note';
import { SyncOutcome, emptyOutcome } from './sync-outcome';
import { indexTasksById } from './task-index';
import { formatTaskLine } from './task-line';
import { TaskLink, TaskLinkStore } from './task-links';

/** The original marker (bullet vs. numbered, checked vs. not) is gone and cannot be restored. */
const RESURRECTED_LINE_PREFIX = '- ';
const RESURRECTED_LINE_CHECKBOX = ' ';

export interface MissingLineRunContext {
  readonly project: ResolvedProject;
  /** Every block id anchoring a task line in any file scanned this run, across every file. */
  readonly takenBlockIds: ReadonlySet<string>;
  /** This run's scanned file paths, so a link that has never been seen still has an unambiguous
   *  resurrection target when there is only ever one file it could have come from. */
  readonly scannedPaths: readonly string[];
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

  constructor(
    provider: TaskProvider,
    links: TaskLinkStore,
    grace: GracePeriod,
    noteFor: (path: string) => SourceNote,
    existsOutsideIgnoredFiles: (blockId: string) => boolean = () => false,
  ) {
    this.provider = provider;
    this.links = links;
    this.grace = grace;
    this.noteFor = noteFor;
    this.existsOutsideIgnoredFiles = existsOutsideIgnoredFiles;
  }

  async run(context: MissingLineRunContext): Promise<SyncOutcome> {
    const outcome = emptyOutcome(context.project.resolution);
    const remoteTasks = indexTasksById(context.project.tasks);

    for (const link of [...this.links.values()]) {
      if (context.takenBlockIds.has(link.blockId)) {
        continue;
      }

      if (this.grace.isPending(link.blockId)) {
        continue;
      }

      await this.resolve(context, remoteTasks, link, outcome);
    }

    this.grace.sweep();
    return outcome;
  }

  /** A vanished line says nothing about the task, so the task is checked rather than assumed gone. */
  private async resolve(
    context: MissingLineRunContext,
    remoteTasks: ReadonlyMap<string, ProviderTask>,
    link: TaskLink,
    outcome: SyncOutcome,
  ): Promise<void> {
    const remoteTask = remoteTasks.get(link.providerTaskId);

    if (remoteTask === undefined) {
      await this.resolveAgainstAbsentTask(context, link, outcome);
      return;
    }

    // Still anchored somewhere outside the configured scope: left alone here, on the same
    // flag-then-remove timing OrphanHousekeeping already gives a task whose link doesn't point
    // back — moving out of scope resolves the same way re-entering scope resolves an orphan.
    if (this.existsOutsideIgnoredFiles(link.blockId)) {
      return;
    }

    if (remoteTask.title.length > 0 && remoteTask.title !== link.lastSyncedTitle) {
      await this.resolveConflict(context, link, remoteTask, outcome);
      return;
    }

    await this.removeTask(context, link, outcome);
  }

  /** Moved out of this project is left untouched; completed here is tidied up like a deletion. */
  private async resolveAgainstAbsentTask(
    context: MissingLineRunContext,
    link: TaskLink,
    outcome: SyncOutcome,
  ): Promise<void> {
    const found = await this.provider.getTask(link.providerTaskId);

    if (found === undefined) {
      this.links.delete(link.blockId);
      return;
    }

    if (found.projectId !== context.project.id || !found.isCompleted) {
      return;
    }

    await this.removeTask(context, link, outcome);
  }

  /**
   * Deleting a line touches its file's mtime like any other edit, so the file the block id was
   * last known to live in stands in for when the deletion happened. With no such file recorded —
   * or one that has since vanished entirely — there is nowhere to resurrect a line into, so the
   * deletion stands rather than guessing a location.
   */
  private async resolveConflict(
    context: MissingLineRunContext,
    link: TaskLink,
    remoteTask: ProviderTask,
    outcome: SyncOutcome,
  ): Promise<void> {
    outcome.conflicted += 1;
    const path = link.lastKnownFilePath ?? soleScannedPath(context.scannedPaths);

    if (path === undefined) {
      await this.removeTask(context, link, outcome);
      return;
    }

    let localModifiedAt: number;

    try {
      localModifiedAt = await this.noteFor(path).lastModified();
    } catch {
      await this.removeTask(context, link, outcome);
      return;
    }

    if (remoteTask.updatedAt === undefined || remoteTask.updatedAt <= localModifiedAt) {
      await this.removeTask(context, link, outcome);
      return;
    }

    await this.noteFor(path).applyEdits({
      replacements: [],
      removals: [],
      blocks: [],
      appended: [
        formatTaskLine({
          prefix: RESURRECTED_LINE_PREFIX,
          checkbox: RESURRECTED_LINE_CHECKBOX,
          title: remoteTask.title,
          tags: [],
          blockId: link.blockId,
        }),
      ],
    });
    this.links.set({ ...link, lastSyncedTitle: remoteTask.title, lastKnownFilePath: path });
    outcome.resurrectedLine += 1;
  }

  private async removeTask(context: MissingLineRunContext, link: TaskLink, outcome: SyncOutcome): Promise<void> {
    await promoteChildrenToTopLevel(this.provider, context.project.tasks, link.providerTaskId, context.project.id);
    await this.provider.removeTask(link.providerTaskId);
    this.links.delete(link.blockId);
    outcome.removedTask += 1;
  }
}

/** Unambiguous only when scope resolves to exactly one file. */
function soleScannedPath(scannedPaths: readonly string[]): string | undefined {
  return scannedPaths.length === 1 ? scannedPaths[0] : undefined;
}
