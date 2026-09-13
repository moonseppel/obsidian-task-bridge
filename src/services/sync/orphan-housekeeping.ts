import { ProviderTask, TaskProvider } from '../task-provider';
import { orphanNoticeDescription, stripOrphanNotice } from './orphan-notice';
import { OrphanTracker } from './orphan-tracker';
import { ProjectTasks } from './project-resolver';
import { promoteChildrenToTopLevel } from './reparent-children';
import { composeRemoteDescription, extractUserDescription } from './task-description';
import { TaskLinkStore } from './task-links';

/** How long a task stays orphaned before its description is flagged with a removal notice. */
const FLAG_AFTER_MS = 60 * 60_000;
/** How long a flagged orphan is given to be re-linked before it is actually removed. */
const REMOVAL_GRACE_MS = 2 * 24 * 60 * 60_000;

interface AnchoredTask {
  readonly id: string;
  readonly blockId: string;
  readonly description: string;
}

/**
 * A task is tracked on this same delayed-removal schedule for either of two reasons: its block id
 * carries no link that points back at it (orphaned), or its link is intact but the block id was
 * not found anywhere this run scanned (moved out of the configured scope — rule 33). Every task in
 * the project is checked regardless of reason, since re-linking or scope re-entry can resolve one
 * the note never mentions.
 */
export class OrphanHousekeeping {
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly orphans: OrphanTracker;

  constructor(provider: TaskProvider, links: TaskLinkStore, orphans: OrphanTracker) {
    this.provider = provider;
    this.links = links;
    this.orphans = orphans;
  }

  async run(project: ProjectTasks, scannedBlockIds: ReadonlySet<string>): Promise<void> {
    const now = Date.now();
    const stillTracked = new Set<string>();

    for (const anchored of anchoredTasksIn(project.tasks)) {
      if (this.isConfirmedInScope(anchored, scannedBlockIds)) {
        await this.unflagIfFlagged(anchored);
        continue;
      }

      this.orphans.track(anchored.id, now);

      // A removed task is gone rather than merely pending removal, so only one still standing stays tracked.
      if (!(await this.removeIfDue(anchored.id, project, now))) {
        stillTracked.add(anchored.id);
        await this.flagIfDue(anchored, now);
      }
    }

    this.orphans.keepOnly(stillTracked);
  }

  private isConfirmedInScope(anchored: AnchoredTask, scannedBlockIds: ReadonlySet<string>): boolean {
    return this.isLinkedBack(anchored) && scannedBlockIds.has(anchored.blockId);
  }

  private isLinkedBack(anchored: AnchoredTask): boolean {
    return this.links.get(anchored.blockId)?.providerTaskId === anchored.id;
  }

  /** Most orphans resolve themselves via a re-link a pass or two later, so flagging waits. */
  private async flagIfDue(anchored: AnchoredTask, now: number): Promise<void> {
    const record = this.orphans.get(anchored.id);

    if (record === undefined || record.removalDueAt !== undefined) {
      return;
    }

    if (now - record.firstSeenOrphanedAt < FLAG_AFTER_MS) {
      return;
    }

    const removalDueAt = now + REMOVAL_GRACE_MS;
    const userText = extractUserDescription(anchored.description);
    const notice = orphanNoticeDescription(anchored.blockId, removalDueAt, userText);

    await this.provider.updateTaskDescription(anchored.id, notice);
    this.orphans.flag(anchored.id, removalDueAt);
  }

  private async removeIfDue(providerTaskId: string, project: ProjectTasks, now: number): Promise<boolean> {
    const record = this.orphans.get(providerTaskId);

    if (record?.removalDueAt === undefined || now < record.removalDueAt) {
      return false;
    }

    await promoteChildrenToTopLevel(this.provider, project, providerTaskId);
    await this.provider.removeTask(providerTaskId);

    return true;
  }

  /** The notice is a courtesy only — never read back — so reverting it decides nothing. */
  private async unflagIfFlagged(anchored: AnchoredTask): Promise<void> {
    if (this.orphans.get(anchored.id)?.removalDueAt === undefined) {
      return;
    }

    const userText = stripOrphanNotice(extractUserDescription(anchored.description));

    await this.provider.updateTaskDescription(anchored.id, composeRemoteDescription(userText, anchored.blockId));
  }
}

function* anchoredTasksIn(tasks: Iterable<ProviderTask>): Generator<AnchoredTask> {
  for (const task of tasks) {
    if (task.embeddedBlockId !== undefined) {
      yield { id: task.id, blockId: task.embeddedBlockId, description: task.description };
    }
  }
}
