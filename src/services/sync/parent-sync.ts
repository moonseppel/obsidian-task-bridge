import { ProviderTask, TaskProvider } from '../task-provider';
import { FieldChange, syncField } from './field-sync';
import { LineUnderSync, appendAfter, localParentBlockId } from './sync-pass';
import { leadingWhitespace } from './task-description';
import { reindentBlock, subtreeSpan } from './task-tree';
import { TaskLink, TaskLinkStore } from './task-links';

/** Undefined when the task has no parent, or its parent isn't itself embedded-block-id tagged. */
export function remoteParentBlockId(
  remoteTasks: ReadonlyMap<string, ProviderTask>,
  remoteTask: ProviderTask,
): string | undefined {
  return remoteTask.parentId === undefined ? undefined : remoteTasks.get(remoteTask.parentId)?.embeddedBlockId;
}

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

  async sync(line: LineUnderSync, link: TaskLink, remoteTask: ProviderTask): Promise<void> {
    const local = localParentBlockId(line.pass, line.lineNumber);
    const remote = remoteParentBlockId(line.pass.remoteTasks, remoteTask);

    const change: FieldChange<string | undefined> = {
      local,
      remote,
      lastSynced: link.lastSyncedParentBlockId,
      remoteUpdatedAt: remoteTask.updatedAt,
      settle: () => this.links.set({ ...link, lastSyncedParentBlockId: remote }),
      push: () => this.push(line, link, local),
      pull: () => this.pull(line, link, remote),
    };

    await syncField(line, change);
  }

  /** Never touches the note: reparenting is purely a provider-side call in the push direction. */
  private async push(line: LineUnderSync, link: TaskLink, parentBlockId: string | undefined): Promise<void> {
    const parentTaskId = parentBlockId === undefined ? undefined : this.links.get(parentBlockId)?.providerTaskId;
    // Falls back to undefined (top-level) when the local parent isn't linked yet, corrected once it is.
    const resolvedParentBlockId = parentTaskId === undefined ? undefined : parentBlockId;

    await this.provider.reparentTask(link.providerTaskId, parentTaskId, line.pass.projectId);
    this.links.set({ ...link, lastSyncedParentBlockId: resolvedParentBlockId });
    line.pass.outcome.pushed += 1;
  }

  private pull(line: LineUnderSync, link: TaskLink, parentBlockId: string | undefined): void {
    if (parentBlockId === undefined) {
      this.pullToTopLevel(line, link);
      return;
    }

    this.pullToNewParent(line, link, parentBlockId);
  }

  /** The line stays exactly where it is; only its own indentation and its subtree's move. */
  private pullToTopLevel(line: LineUnderSync, link: TaskLink): void {
    const { pass } = line;
    const oldParentLineNumber = pass.parentLineNumbers.get(line.lineNumber);

    if (oldParentLineNumber === undefined) {
      // The note already reads as top-level; only the stored link disagreed.
      this.links.set({ ...link, lastSyncedParentBlockId: undefined });
      return;
    }

    const childIndent = leadingWhitespace(line.original);
    const targetIndent = leadingWhitespace(pass.lines[oldParentLineNumber]);
    const span = subtreeSpan(pass.lines, line.lineNumber);
    const affectedLines = [line.lineNumber, ...range(span.startLine, span.endLineExclusive)];
    const reindented = reindentBlock(affectedLines.map((n) => pass.lines[n]), childIndent, targetIndent);

    affectedLines.forEach((lineNumber, index) => {
      const replacement = reindented[index];

      if (replacement !== pass.lines[lineNumber]) {
        pass.replacements.push({ lineNumber, expected: pass.lines[lineNumber], replacement });
      }
    });

    this.links.set({ ...link, lastSyncedParentBlockId: undefined });
    line.pass.outcome.pulled += 1;
  }

  /** Relocates the line and its whole subtree under the new parent's existing content. */
  private pullToNewParent(line: LineUnderSync, link: TaskLink, newParentBlockId: string): void {
    const { pass } = line;
    const newParentLineNumber = pass.lineNumberByBlockId.get(newParentBlockId);

    if (newParentLineNumber === undefined) {
      // The new parent has no line of its own here yet; retried once it does.
      return;
    }

    const oldSpan = subtreeSpan(pass.lines, line.lineNumber);
    const movedLines = [line.original, ...pass.lines.slice(oldSpan.startLine, oldSpan.endLineExclusive)];
    const newParentIndent = leadingWhitespace(pass.lines[newParentLineNumber]);
    const reindented = reindentBlock(movedLines, leadingWhitespace(line.original), `${newParentIndent}\t`);

    pass.removals.push({ lineNumber: line.lineNumber, expected: line.original });

    for (const lineNumber of range(oldSpan.startLine, oldSpan.endLineExclusive)) {
      pass.removals.push({ lineNumber, expected: pass.lines[lineNumber] });
    }

    appendAfter(pass, newParentLineNumber, reindented);
    this.links.set({ ...link, lastSyncedParentBlockId: newParentBlockId });
    line.pass.outcome.pulled += 1;
  }
}

function range(startInclusive: number, endExclusive: number): number[] {
  return Array.from({ length: endExclusive - startInclusive }, (_, index) => startInclusive + index);
}
