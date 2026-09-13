import { ProviderTask, TaskProvider } from '../task-provider';
import { FieldChange, syncField } from './field-sync';
import { LinkedLine, localParentBlockId, recordMoveUnder, recordReindent } from './sync-pass';
import { leadingWhitespace } from './task-description';
import { TaskLinkStore } from './task-links';

/**
 * Syncs which task a line is nested under, both directions, by the same recency rule every other
 * field uses. Pushing a reparent (to a specific parent, or to none) never touches the note — only
 * the provider call changes. Pulling a reparent to no parent only reindents the line in place;
 * pulling a reparent to a specific new parent relocates the line's whole subtree there.
 */
export class ParentSync {
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;

  constructor(provider: TaskProvider, links: TaskLinkStore) {
    this.provider = provider;
    this.links = links;
  }

  async sync(linked: LinkedLine, remoteTask: ProviderTask): Promise<void> {
    const { line, link } = linked;
    const local = localParentBlockId(line.pass, line.lineNumber);
    const remote = remoteParentBlockId(line.pass.remoteTasks, remoteTask);

    const change: FieldChange<string | undefined> = {
      local,
      remote,
      lastSynced: link.lastSyncedParentBlockId,
      remoteUpdatedAt: remoteTask.updatedAt,
      settle: () => this.links.set({ ...link, lastSyncedParentBlockId: remote }),
      push: () => this.push(linked, local),
      pull: () => this.pull(linked, remote),
    };

    await syncField(line, change);
  }

  /** A local parent that is not linked yet is pushed as top-level for now, corrected once it is. */
  private async push(linked: LinkedLine, parentBlockId: string | undefined): Promise<void> {
    const { line, link } = linked;
    const parent = this.links.linkedParent(parentBlockId);

    await this.provider.reparentTask(link.providerTaskId, parent.providerTaskId, line.pass.projectId);
    this.links.set({ ...link, lastSyncedParentBlockId: parent.blockId });
    line.pass.outcome.pushed += 1;
  }

  private pull(linked: LinkedLine, parentBlockId: string | undefined): void {
    if (parentBlockId === undefined) {
      this.pullToTopLevel(linked);
      return;
    }

    this.pullToNewParent(linked, parentBlockId);
  }

  /** The line stays exactly where it is; only its own indentation and its subtree's move. */
  private pullToTopLevel(linked: LinkedLine): void {
    const { line, link } = linked;
    const oldParentLineNumber = line.pass.parentLineNumbers.get(line.lineNumber);

    if (oldParentLineNumber === undefined) {
      // The note already reads as top-level; only the stored link disagreed.
      this.links.set({ ...link, lastSyncedParentBlockId: undefined });
      return;
    }

    recordReindent(line, leadingWhitespace(line.pass.lines[oldParentLineNumber]));
    this.links.set({ ...link, lastSyncedParentBlockId: undefined });
    line.pass.outcome.pulled += 1;
  }

  /** Relocates the line and its whole subtree under the new parent's existing content. */
  private pullToNewParent(linked: LinkedLine, newParentBlockId: string): void {
    const { line, link } = linked;
    const newParentLineNumber = line.pass.lineNumberByBlockId.get(newParentBlockId);

    if (newParentLineNumber === undefined) {
      // The new parent has no line of its own here yet; retried once it does.
      return;
    }

    recordMoveUnder(line, newParentLineNumber);
    this.links.set({ ...link, lastSyncedParentBlockId: newParentBlockId });
    line.pass.outcome.pulled += 1;
  }
}

/** Undefined when the task has no parent, or its parent isn't itself embedded-block-id tagged. */
export function remoteParentBlockId(
  remoteTasks: ReadonlyMap<string, ProviderTask>,
  remoteTask: ProviderTask,
): string | undefined {
  return remoteTask.parentId === undefined ? undefined : remoteTasks.get(remoteTask.parentId)?.embeddedBlockId;
}
