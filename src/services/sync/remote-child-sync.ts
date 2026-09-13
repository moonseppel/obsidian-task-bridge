import { ProviderTask } from '../task-provider';
import { createBlockId } from './block-id';
import { SyncPass, appendAfter } from './sync-pass';
import { leadingWhitespace } from './task-description';
import { formatTaskLine } from './task-line';
import { TaskLink, TaskLinkStore } from './task-links';

/** One file's pass, plus every provider task already linked or pulled in so far this pass. */
interface ChildPull {
  readonly pass: SyncPass;
  readonly alreadyLinked: Set<string>;
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
    const pull: ChildPull = {
      pass,
      alreadyLinked: new Set([...this.links.values()].map((link) => link.providerTaskId)),
    };

    for (const [lineNumber, blockId] of pass.blockIdByLineNumber) {
      const link = this.links.get(blockId);

      if (link === undefined) {
        continue;
      }

      const childLines = this.buildChildLines(pull, pullParentOf(link, pass.lines[lineNumber] ?? ''));

      appendAfter(pass, lineNumber, childLines);
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

      lines.push(formatTaskLine({ prefix, checkbox: ' ', title: task.title, tags: [], blockId }));
      lines.push(...this.buildChildLines(pull, { taskId: task.id, blockId, childIndent: `${parent.childIndent}\t` }));
    }

    return lines;
  }

  private linkChild(pull: ChildPull, task: ProviderTask, parentBlockId: string): string {
    const blockId = createBlockId(pull.pass.takenBlockIds, this.getDeviceTag());

    pull.pass.takenBlockIds.add(blockId);
    pull.alreadyLinked.add(task.id);
    this.links.set({
      blockId,
      providerTaskId: task.id,
      lastSyncedTitle: task.title,
      lastSyncedParentBlockId: parentBlockId,
    });

    return blockId;
  }
}

function pullParentOf(link: TaskLink, parentLine: string): PullParent {
  return {
    taskId: link.providerTaskId,
    blockId: link.blockId,
    childIndent: `${leadingWhitespace(parentLine)}\t`,
  };
}
