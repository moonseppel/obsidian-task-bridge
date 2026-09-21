import { Logger } from '../../../utils/logger';
import { ProviderTask, TaskProvider } from '../../task-provider';
import { createBlockId } from '../task-format/block-id';
import { SourceNote } from '../note-access/source-note';
import { LineUnderSync, LinkedLine, localParentBlockId } from './sync-pass';
import { canonicalTags } from './tag-set';
import { readDescriptionBlock } from '../task-format/task-description';
import { composeRemoteDescription } from '../task-format/task-footer';
import { isDone } from '../task-format/task-line';
import { LinkedParent, TaskLink, TaskLinkStore, linkIds } from '../sync-state/task-links';

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

  /**
   * Creates the task, then anchors the line to it immediately — not batched with the rest of the
   * pass's edits — so the window in which something else could change this exact line first, and
   * strand the new task with no line pointing back at it, is as small as it can be. If the anchor
   * still can't land, the task is undone rather than left as an untraceable duplicate: the line is
   * untouched, so the very next pass gives it a clean, ordinary attempt (architecture-rules.md
   * rule 36).
   */
  async create(line: LineUnderSync, note: SourceNote): Promise<void> {
    const { pass, task } = line;
    // Reused, never replaced, so one task can never end up with two anchors on its line.
    const blockId = task.blockId ?? createBlockId(pass.takenBlockIds, this.getDeviceTag());
    pass.blockIdByLineNumber.set(line.lineNumber, blockId);
    pass.takenBlockIds.add(blockId);

    const created = await this.createAndLink(line, blockId);
    const taskId = created.providerTaskId;

    if (!(await note.appendAnchorIfMissing(line.lineNumber, blockId, pass.indentation))) {
      await this.abandonUnanchored(blockId, taskId);
      pass.outcome.abandonedCreations += 1;
      return;
    }

    pass.outcome.created += 1;
    logger.debug('Created a task for a new line', { blockId, taskId });
  }

  /** A deleted task leaves no timestamp to compare, so the missing-timestamp rule hands it to local. */
  async recreate(linked: LinkedLine): Promise<void> {
    const { line, link } = linked;
    const recreated = await this.createAndLink(line, link.blockId);

    line.pass.outcome.conflicted += 1;
    line.pass.outcome.recreatedTask += 1;
    logger.debug('Recreated a task deleted in Todoist, since its line carried a newer edit', {
      blockId: link.blockId,
      deletedTaskId: link.providerTaskId,
      taskId: recreated.providerTaskId,
    });
  }

  /**
   * The line moved on before the anchor could land — most plausibly another sync pass racing on
   * the same note — so the task just created has no way back to any line. Undoing it here, before
   * any link is even saved, is safer than leaving an orphan behind: the line is untouched and gets
   * a fresh, ordinary attempt next pass instead of accumulating an untraceable duplicate.
   */
  private async abandonUnanchored(blockId: string, taskId: string): Promise<void> {
    this.links.delete(blockId);
    await this.provider.removeTask(taskId);
    logger.warn('Could not anchor a newly created task to its line; removed it to retry cleanly', {
      blockId,
      taskId,
    });
  }

  /**
   * Written together: a task whose link went unsaved is created again on the next pass. A parent
   * still waiting out its own creation grace period is not linked yet, so its child is created as
   * top-level for now and corrected the next pass. Resolves to the link it saved.
   */
  private async createAndLink(line: LineUnderSync, blockId: string): Promise<TaskLink> {
    const { pass, task } = line;
    const description = readDescriptionBlock(pass.lines, line.lineNumber, pass.indentation).text;
    const parent = this.links.linkedParent(localParentBlockId(pass, line.lineNumber));
    const created = await this.provider.createTask({
      title: task.title,
      projectId: pass.projectId,
      description: composeRemoteDescription(description, blockId),
      labels: task.tags,
      parentId: parent.providerTaskId,
      isCompleted: isDone(task),
    });
    const link = {
      blockId,
      providerTaskId: created.id,
      lastSyncedTitle: task.title,
      lastSyncedDescription: description,
      lastSyncedTags: canonicalTags(task.tags),
      lastSyncedParentBlockId: parentBlockIdOf(parent, created),
      lastSyncedDone: created.isCompleted,
    };

    this.links.set(link);
    return link;
  }
}

/** Only the parent the provider actually kept counts; anything it dropped is pushed again next pass. */
function parentBlockIdOf(parent: LinkedParent, created: ProviderTask): string | undefined {
  return created.parentId === parent.providerTaskId ? parent.blockId : undefined;
}
