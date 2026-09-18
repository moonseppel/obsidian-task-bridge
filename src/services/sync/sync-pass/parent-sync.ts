import { Logger } from '../../../utils/logger';
import { ProviderTask, TaskProvider } from '../../task-provider';
import { FieldChange, syncField } from './field-sync';
import { LinkedLine, localParentBlockId, recordMoveUnder, recordPendingRelocation, recordReindent } from './sync-pass';
import { leadingWhitespace } from '../task-format/task-description';
import { TaskLinkStore, linkIds } from '../sync-state/task-links';

const logger = new Logger('TaskBridge:Sync');

/**
 * Syncs which task a line is nested under, both directions, by the same recency rule every other
 * field uses. Pushing a reparent (to a specific parent, or to none) never touches the note — only
 * the provider call changes. Pulling a reparent to no parent only reindents the line in place;
 * pulling a reparent to a specific new parent relocates the line's whole subtree there, whether
 * that parent lives in this same file (done here) or another in-scope one (queued for
 * `CrossFileParentSync`, since the target file may not have been read yet).
 */
export class ParentSync {
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly locateParentFile: (blockId: string) => Promise<string | undefined>;

  constructor(provider: TaskProvider, links: TaskLinkStore, locateParentFile: (blockId: string) => Promise<string | undefined>) {
    this.provider = provider;
    this.links = links;
    this.locateParentFile = locateParentFile;
  }

  async sync(linked: LinkedLine, remoteTask: ProviderTask): Promise<void> {
    const { line, link } = linked;

    // Only this run's own project was fetched, so a remote parent living outside it can't be told
    // apart from having no parent at all. Leaving the field alone here is safer than misreading
    // "unresolvable" as "top-level", which would otherwise pull a wrong reindent.
    if (remoteTask.parentId !== undefined && !line.pass.remoteTasks.has(remoteTask.parentId)) {
      logger.debug('Remote parent is outside the fetched project; leaving the parent field alone', {
        ...linkIds(link),
        remoteParentId: remoteTask.parentId,
      });
      return;
    }

    const local = localParentBlockId(line.pass, line.lineNumber);
    const remote = remoteParentBlockId(line.pass.remoteTasks, remoteTask);

    const change: FieldChange<string | undefined> = {
      field: 'parent',
      local,
      remote,
      lastSynced: link.lastSyncedParentBlockId,
      remoteUpdatedAt: remoteTask.updatedAt,
      settle: () => this.links.set({ ...link, lastSyncedParentBlockId: remote }),
      push: () => this.push(linked, local, remoteTask.projectId),
      pull: () => this.pull(linked, remote),
    };

    await syncField(line, change);
  }

  /**
   * A local parent that is not linked yet is pushed as top-level for now, corrected once it is.
   * Clearing a parent re-sends the task's own current project (see `TaskProvider.reparentTask`),
   * not the pass's configured one, so a task synced from a different Todoist project than this
   * plugin is configured for stays exactly where its owner put it.
   */
  private async push(linked: LinkedLine, parentBlockId: string | undefined, projectId: string): Promise<void> {
    const { line, link } = linked;
    const parent = this.links.linkedParent(parentBlockId);

    await this.provider.reparentTask(link.providerTaskId, parent.providerTaskId, projectId);
    this.links.set({ ...link, lastSyncedParentBlockId: parent.blockId });
    line.pass.outcome.pushed += 1;
  }

  private async pull(linked: LinkedLine, parentBlockId: string | undefined): Promise<void> {
    if (parentBlockId === undefined) {
      this.pullToTopLevel(linked);
      return;
    }

    await this.pullToNewParent(linked, parentBlockId);
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
  private async pullToNewParent(linked: LinkedLine, newParentBlockId: string): Promise<void> {
    const { line, link } = linked;
    const newParentLineNumber = line.pass.lineNumberByBlockId.get(newParentBlockId);

    if (newParentLineNumber !== undefined) {
      recordMoveUnder(line, newParentLineNumber);
      this.links.set({ ...link, lastSyncedParentBlockId: newParentBlockId });
      line.pass.outcome.pulled += 1;
      return;
    }

    await this.queueCrossFileRelocation(linked, newParentBlockId);
  }

  /**
   * The new parent isn't in this file; if it's in another in-scope one, the relocation is deferred
   * to `CrossFileParentSync` rather than done here — this file's own edits may not be written yet,
   * and the target's are read fresh only once every file's pass has committed its own. Not found
   * anywhere in scope is left exactly as before: retried next pass, no edits at all.
   */
  private async queueCrossFileRelocation(linked: LinkedLine, newParentBlockId: string): Promise<void> {
    const { line, link } = linked;
    const targetPath = await this.locateParentFile(newParentBlockId);

    if (targetPath === undefined) {
      logger.debug('New parent has no line anywhere in scope yet; relocation retried next pass', {
        ...linkIds(link),
        newParentBlockId,
      });
      return;
    }

    recordPendingRelocation(line, newParentBlockId, targetPath);
    logger.debug('New parent lives in a different note; relocation queued for this run', {
      ...linkIds(link),
      newParentBlockId,
      targetPath,
    });
  }
}

/** Undefined when the task has no parent, or its parent isn't itself embedded-block-id tagged. */
export function remoteParentBlockId(
  remoteTasks: ReadonlyMap<string, ProviderTask>,
  remoteTask: ProviderTask,
): string | undefined {
  return remoteTask.parentId === undefined ? undefined : remoteTasks.get(remoteTask.parentId)?.embeddedBlockId;
}
