import { Logger } from '../../../utils/logger';
import { ProviderTask, TaskProvider } from '../../task-provider';
import { orphanNoticeDescription, stripOrphanNotice } from './orphan-notice';
import { OrphanTracker } from './orphan-tracker';
import { ResolvedProject } from '../sync-run/project-resolver';
import { promoteChildrenToTopLevel } from './reparent-children';
import { SyncOutcome, emptyOutcome } from '../sync-run/sync-outcome';
import { composeRemoteDescription, extractUserDescription } from '../task-format/task-description';
import { LinkIds, TaskLinkStore } from '../sync-state/task-links';

const logger = new Logger('TaskBridge:Sync');

/** How long a task stays orphaned before its description is flagged with a removal notice. */
const FLAG_AFTER_MS = 60 * 60_000;
/** How long a flagged orphan is given to be re-linked before it is actually removed. */
const REMOVAL_GRACE_MS = 2 * 24 * 60 * 60_000;

interface AnchoredTask {
  readonly id: string;
  readonly blockId: string;
  readonly description: string;
}

/** One housekeeping run: what it checks against, the moment it started, and what it has done so far. */
interface HousekeepingSweep {
  readonly project: ResolvedProject;
  readonly scannedBlockIds: ReadonlySet<string>;
  readonly now: number;
  readonly stillTracked: Set<string>;
  readonly outcome: SyncOutcome;
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

  async run(project: ResolvedProject, scannedBlockIds: ReadonlySet<string>): Promise<SyncOutcome> {
    const sweep: HousekeepingSweep = {
      project,
      scannedBlockIds,
      now: Date.now(),
      stillTracked: new Set(),
      outcome: emptyOutcome(project.resolution),
    };

    for (const anchored of anchoredTasksIn(project.tasks)) {
      await this.housekeep(anchored, sweep);
    }

    this.orphans.keepOnly(sweep.stillTracked);
    return sweep.outcome;
  }

  private async housekeep(anchored: AnchoredTask, sweep: HousekeepingSweep): Promise<void> {
    if (this.isConfirmedInScope(anchored, sweep.scannedBlockIds)) {
      await this.unflagIfFlagged(anchored, sweep);
      return;
    }

    if (this.orphans.get(anchored.id) === undefined) {
      logger.debug('Task has no link back to it or its line left scope; tracking it for removal', idsOf(anchored));
    }

    this.orphans.track(anchored.id, sweep.now);

    // A removed task is gone rather than merely pending removal, so only one still standing stays tracked.
    if (!(await this.removeIfDue(anchored, sweep))) {
      sweep.stillTracked.add(anchored.id);
      await this.flagIfDue(anchored, sweep);
    }
  }

  private isConfirmedInScope(anchored: AnchoredTask, scannedBlockIds: ReadonlySet<string>): boolean {
    return this.isLinkedBack(anchored) && scannedBlockIds.has(anchored.blockId);
  }

  private isLinkedBack(anchored: AnchoredTask): boolean {
    return this.links.get(anchored.blockId)?.providerTaskId === anchored.id;
  }

  /** Most orphans resolve themselves via a re-link a pass or two later, so flagging waits. */
  private async flagIfDue(anchored: AnchoredTask, sweep: HousekeepingSweep): Promise<void> {
    const record = this.orphans.get(anchored.id);

    if (record === undefined || record.removalDueAt !== undefined) {
      return;
    }

    if (sweep.now - record.firstSeenOrphanedAt < FLAG_AFTER_MS) {
      return;
    }

    const removalDueAt = sweep.now + REMOVAL_GRACE_MS;
    const userText = extractUserDescription(anchored.description);
    const notice = orphanNoticeDescription(anchored.blockId, removalDueAt, userText);

    await this.provider.updateTaskDescription(anchored.id, notice);
    this.orphans.flag(anchored.id, removalDueAt);
    sweep.outcome.flaggedOrphans += 1;
    logger.debug('Flagged an orphaned task for removal', { ...idsOf(anchored), removalDueAt });
  }

  private async removeIfDue(anchored: AnchoredTask, sweep: HousekeepingSweep): Promise<boolean> {
    const record = this.orphans.get(anchored.id);

    if (record?.removalDueAt === undefined || sweep.now < record.removalDueAt) {
      return false;
    }

    await promoteChildrenToTopLevel(this.provider, sweep.project, anchored.id);
    await this.provider.removeTask(anchored.id);
    sweep.outcome.removedOrphans += 1;
    logger.info('Deleted an orphaned task once its removal date passed', idsOf(anchored));

    return true;
  }

  /** The notice is a courtesy only — never read back — so reverting it decides nothing. */
  private async unflagIfFlagged(anchored: AnchoredTask, sweep: HousekeepingSweep): Promise<void> {
    if (this.orphans.get(anchored.id)?.removalDueAt === undefined) {
      return;
    }

    const userText = stripOrphanNotice(extractUserDescription(anchored.description));

    await this.provider.updateTaskDescription(anchored.id, composeRemoteDescription(userText, anchored.blockId));
    sweep.outcome.unflaggedOrphans += 1;
    logger.debug('Un-flagged a task that is linked and in scope again', idsOf(anchored));
  }
}

function* anchoredTasksIn(tasks: Iterable<ProviderTask>): Generator<AnchoredTask> {
  for (const task of tasks) {
    if (task.embeddedBlockId !== undefined) {
      yield { id: task.id, blockId: task.embeddedBlockId, description: task.description };
    }
  }
}

function idsOf(anchored: AnchoredTask): LinkIds {
  return { blockId: anchored.blockId, taskId: anchored.id };
}
