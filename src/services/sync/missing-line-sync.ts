import { ProviderTask, TaskProvider } from '../task-provider';
import { GracePeriod } from './grace-period';
import { promoteChildrenToTopLevel } from './reparent-children';
import { SyncPass } from './sync-pass';
import { formatTaskLine } from './task-line';
import { TaskLink, TaskLinkStore } from './task-links';

/** The original marker (bullet vs. numbered, checked vs. not) is gone and cannot be restored. */
const RESURRECTED_LINE_PREFIX = '- ';
const RESURRECTED_LINE_CHECKBOX = ' ';

/** Walks every stored link, not the note's lines: a deleted line is exactly one the note lacks. */
export class MissingLineSync {
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly grace: GracePeriod;

  constructor(provider: TaskProvider, links: TaskLinkStore, grace: GracePeriod) {
    this.provider = provider;
    this.links = links;
    this.grace = grace;
  }

  async run(pass: SyncPass): Promise<void> {
    for (const link of [...this.links.values()]) {
      if (pass.takenBlockIds.has(link.blockId)) {
        continue;
      }

      if (this.grace.isPending(link.blockId)) {
        continue;
      }

      await this.resolve(pass, link);
    }

    this.grace.sweep();
  }

  /** A vanished line says nothing about the task, so the task is checked rather than assumed gone. */
  private async resolve(pass: SyncPass, link: TaskLink): Promise<void> {
    const remoteTask = pass.remoteTasks.get(link.providerTaskId);

    if (remoteTask === undefined) {
      await this.resolveAgainstAbsentTask(pass, link);
      return;
    }

    if (remoteTask.title.length > 0 && remoteTask.title !== link.lastSyncedTitle) {
      await this.resolveConflict(pass, link, remoteTask);
      return;
    }

    await this.removeTask(pass, link);
  }

  /** Moved out of this project is left untouched; completed here is tidied up like a deletion. */
  private async resolveAgainstAbsentTask(pass: SyncPass, link: TaskLink): Promise<void> {
    const found = await this.provider.getTask(link.providerTaskId);

    if (found === undefined) {
      this.links.delete(link.blockId);
      return;
    }

    if (found.projectId !== pass.projectId || !found.isCompleted) {
      return;
    }

    await this.removeTask(pass, link);
  }

  /**
   * Deleting a line touches the note's mtime like any other edit, so it stands in for when the
   * deletion happened. A resurrected line is appended: its old position no longer exists.
   */
  private async resolveConflict(pass: SyncPass, link: TaskLink, remoteTask: ProviderTask): Promise<void> {
    pass.outcome.conflicted += 1;

    if (remoteTask.updatedAt === undefined || remoteTask.updatedAt <= pass.localModifiedAt) {
      await this.removeTask(pass, link);
      return;
    }

    pass.appended.push(
      formatTaskLine({
        prefix: RESURRECTED_LINE_PREFIX,
        checkbox: RESURRECTED_LINE_CHECKBOX,
        title: remoteTask.title,
        tags: [],
        blockId: link.blockId,
      }),
    );
    this.links.set({ ...link, lastSyncedTitle: remoteTask.title });
    pass.outcome.resurrectedLine += 1;
  }

  private async removeTask(pass: SyncPass, link: TaskLink): Promise<void> {
    await promoteChildrenToTopLevel(this.provider, [...pass.remoteTasks.values()], link.providerTaskId, pass.projectId);
    await this.provider.removeTask(link.providerTaskId);
    this.links.delete(link.blockId);
    pass.outcome.removedTask += 1;
  }
}
