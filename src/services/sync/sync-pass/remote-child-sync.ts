import { Logger } from '../../../utils/logger';
import { ProviderTask } from '../../task-provider';
import { createBlockId } from '../task-format/block-id';
import { SyncPass, recordInsertUnder } from './sync-pass';
import { leadingWhitespace } from '../task-format/task-description';
import { collectBlockIds, formatTaskLine, taskLineFrom } from '../task-format/task-line';
import { TaskLink, TaskLinkStore } from '../sync-state/task-links';

const logger = new Logger('TaskBridge:Sync');

/** One file's pass, every task already pulled in, and the link (if any) each one can reuse. */
interface ChildPull {
  readonly pass: SyncPass;
  readonly alreadyLinked: Set<string>;
  readonly linkByTaskId: ReadonlyMap<string, TaskLink>;
}

/** A linked task whose provider-only children are pulled in underneath it. */
interface PullParent {
  readonly taskId: string;
  readonly blockId: string;
  readonly childIndent: string;
}

/**
 * A sub-task added directly in the provider, under a task this plugin already links, is pulled
 * into the note as a new indented line. This is a deliberate, narrow exception to only ever
 * syncing a task that originated in Obsidian: Feature 8 asks for exactly this, and a task whose
 * whole ancestor chain has no Obsidian-linked task anywhere in it is still never pulled in, since
 * recursion only ever starts from an anchor already known locally.
 */
export class RemoteChildSync {
  private readonly links: TaskLinkStore;
  private readonly getDeviceTag: () => string;

  constructor(links: TaskLinkStore, getDeviceTag: () => string) {
    this.links = links;
    this.getDeviceTag = getDeviceTag;
  }

  run(pass: SyncPass): void {
    const links = [...this.links.values()];
    const pull: ChildPull = {
      pass,
      alreadyLinked: alreadyAnchoredTaskIds(pass, links),
      linkByTaskId: new Map(links.map((link): [string, TaskLink] => [link.providerTaskId, link])),
    };

    for (const [lineNumber, blockId] of pass.blockIdByLineNumber) {
      const link = this.links.get(blockId);

      if (link === undefined) {
        continue;
      }

      const childLines = this.buildChildLines(pull, pullParentOf(link, pass.lines[lineNumber] ?? ''));

      recordInsertUnder(pass, lineNumber, childLines);
      pass.outcome.pulled += childLines.length;
    }
  }

  /** Recurses so a remote-only chain several levels deep is pulled in together, in one pass. */
  private buildChildLines(pull: ChildPull, parent: PullParent): string[] {
    const lines: string[] = [];

    for (const task of pull.pass.remoteTasks.values()) {
      if (task.parentId !== parent.taskId || pull.alreadyLinked.has(task.id)) {
        continue;
      }

      const blockId = this.linkChild(pull, task, parent.blockId);
      const prefix = `${parent.childIndent}- `;

      lines.push(formatTaskLine(taskLineFrom({ prefix, checkbox: ' ', text: task.title, blockId })));
      lines.push(...this.buildChildLines(pull, { taskId: task.id, blockId, childIndent: `${parent.childIndent}\t` }));
    }

    return lines;
  }

  /**
   * Reuses the block id an earlier attempt already linked this same provider task to, rather than
   * minting a second one, so a retried insert lands under the identity already on record instead
   * of orphaning it.
   */
  private linkChild(pull: ChildPull, task: ProviderTask, parentBlockId: string): string {
    const reused = pull.linkByTaskId.get(task.id)?.blockId;
    const blockId = reused ?? createBlockId(pull.pass.takenBlockIds, this.getDeviceTag());

    pull.pass.takenBlockIds.add(blockId);
    pull.alreadyLinked.add(task.id);
    this.links.set({
      blockId,
      providerTaskId: task.id,
      lastSyncedTitle: task.title,
      lastSyncedParentBlockId: parentBlockId,
    });
    logger.info('Adding a line for a sub-task created in Todoist', { blockId, taskId: task.id, parentBlockId });

    return blockId;
  }
}

/**
 * A child whose block id appears anywhere in the note, description text included, is already
 * pulled in. A link not anchored anywhere yet doesn't count: its insert may have been dropped by a
 * stale guard (an overlapping sync pass, say), and it needs retrying with the same block id rather
 * than being silently abandoned — see architecture-rules.md rule 36.
 */
function alreadyAnchoredTaskIds(pass: SyncPass, links: readonly TaskLink[]): Set<string> {
  const blockIdsInNote = collectBlockIds(pass.lines);

  return new Set(
    links
      .filter((link) => blockIdsInNote.has(link.blockId) || link.lastKnownFilePath !== undefined)
      .map((link) => link.providerTaskId),
  );
}

function pullParentOf(link: TaskLink, parentLine: string): PullParent {
  return {
    taskId: link.providerTaskId,
    blockId: link.blockId,
    childIndent: `${leadingWhitespace(parentLine)}\t`,
  };
}
