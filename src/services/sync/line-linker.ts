import { Logger } from '../../utils/logger';
import { TaskProvider } from '../task-provider';
import { createBlockId } from './block-id';
import { LineUnderSync, LinkedLine, localParentBlockId, recordTaskEdit } from './sync-pass';
import { canonicalTags } from './tag-set';
import { composeRemoteDescription, readDescriptionBlock } from './task-description';
import { TaskLinkStore, linkIds } from './task-links';

const logger = new Logger('TaskBridge:Sync');

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
    logger.debug('Re-linked a line to the task already carrying its block id', linkIds(link));

    return { line, link };
  }

  async create(line: LineUnderSync): Promise<void> {
    const { pass, task } = line;
    // Reused, never replaced, so one task can never end up with two anchors on its line.
    const blockId = task.blockId ?? createBlockId(pass.takenBlockIds, this.getDeviceTag());
    pass.blockIdByLineNumber.set(line.lineNumber, blockId);

    const taskId = await this.createAndLink(line, blockId);
    pass.takenBlockIds.add(blockId);
    recordTaskEdit(line, { blockId });
    pass.outcome.created += 1;
    logger.info('Created a task for a new line', { blockId, taskId });
  }

  /** A deleted task leaves no timestamp to compare, so the missing-timestamp rule hands it to local. */
  async recreate(linked: LinkedLine): Promise<void> {
    const { line, link } = linked;
    const taskId = await this.createAndLink(line, link.blockId);

    line.pass.outcome.conflicted += 1;
    line.pass.outcome.recreatedTask += 1;
    logger.info('Recreated a task deleted in Todoist, since its line carried a newer edit', {
      blockId: link.blockId,
      deletedTaskId: link.providerTaskId,
      taskId,
    });
  }

  /**
   * Written together: a task whose link went unsaved is created again on the next pass. A parent
   * still waiting out its own creation grace period is not linked yet, so its child is created as
   * top-level for now and corrected the next pass. Resolves to the new task's id.
   */
  private async createAndLink(line: LineUnderSync, blockId: string): Promise<string> {
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
    return created.id;
  }
}
