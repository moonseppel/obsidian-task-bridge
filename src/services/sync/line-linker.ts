import { TaskProvider } from '../task-provider';
import { createBlockId } from './block-id';
import { LineUnderSync, LinkedLine, localParentBlockId, recordTaskEdit } from './sync-pass';
import { canonicalTags } from './tag-set';
import { composeRemoteDescription, readDescriptionBlock } from './task-description';
import { TaskLinkStore } from './task-links';

/**
 * Gives a line a link to a provider task: to one that already carries its block id, to a newly
 * created one, or to a recreation of one deleted while the line carried a newer edit.
 */
export class LineLinker {
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly getDeviceTag: () => string;

  constructor(provider: TaskProvider, links: TaskLinkStore, getDeviceTag: () => string) {
    this.provider = provider;
    this.links = links;
    this.getDeviceTag = getDeviceTag;
  }

  /** Searches the task list already in hand rather than creating a second task for the same line. */
  relinkIfAlreadyAnchored(line: LineUnderSync): LinkedLine | undefined {
    const { blockId } = line.task;

    if (blockId === undefined) {
      return undefined;
    }

    const match = line.pass.remoteTasksByBlockId.get(blockId);

    if (match === undefined) {
      return undefined;
    }

    const link = { blockId, providerTaskId: match.id, lastSyncedTitle: match.title };
    this.links.set(link);

    return { line, link };
  }

  async create(line: LineUnderSync): Promise<void> {
    const { pass, task } = line;
    // Reused, never replaced, so one task can never end up with two anchors on its line.
    const blockId = task.blockId ?? createBlockId(pass.takenBlockIds, this.getDeviceTag());
    pass.blockIdByLineNumber.set(line.lineNumber, blockId);

    await this.createAndLink(line, blockId);
    pass.takenBlockIds.add(blockId);
    recordTaskEdit(line, { blockId });
    pass.outcome.created += 1;
  }

  /** A deleted task leaves no timestamp to compare, so the missing-timestamp rule hands it to local. */
  async recreate(linked: LinkedLine): Promise<void> {
    const { line, link } = linked;

    await this.createAndLink(line, link.blockId);
    line.pass.outcome.conflicted += 1;
    line.pass.outcome.recreatedTask += 1;
  }

  /**
   * Written together: a task whose link went unsaved is created again on the next pass. A parent
   * still waiting out its own creation grace period is not linked yet, so its child is created as
   * top-level for now and corrected the next pass.
   */
  private async createAndLink(line: LineUnderSync, blockId: string): Promise<void> {
    const { pass, task } = line;
    const description = readDescriptionBlock(pass.lines, line.lineNumber).text;
    const parent = this.links.linkedParent(localParentBlockId(pass, line.lineNumber));
    const created = await this.provider.createTask({
      title: task.title,
      projectId: pass.projectId,
      description: composeRemoteDescription(description, blockId),
      labels: task.tags,
      parentId: parent.providerTaskId,
    });

    this.links.set({
      blockId,
      providerTaskId: created.id,
      lastSyncedTitle: task.title,
      lastSyncedDescription: description,
      lastSyncedTags: canonicalTags(task.tags),
      lastSyncedParentBlockId: parent.blockId,
    });
  }
}
