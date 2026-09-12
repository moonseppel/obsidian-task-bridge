import { createBlockId } from './block-id';
import { leadingWhitespace } from './task-description';
import { SyncPass } from './sync-pass';
import { subtreeSpan } from './task-tree';
import { formatTaskLine } from './task-line';
import { TaskLinkStore } from './task-links';

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
    const alreadyLinked = new Set([...this.links.values()].map((link) => link.providerTaskId));

    for (const [lineNumber, blockId] of pass.blockIdByLineNumber) {
      const link = this.links.get(blockId);

      if (link !== undefined) {
        this.insertChildrenOf(pass, link.providerTaskId, blockId, lineNumber, alreadyLinked);
      }
    }
  }

  private insertChildrenOf(
    pass: SyncPass,
    parentTaskId: string,
    parentBlockId: string,
    parentLineNumber: number,
    alreadyLinked: Set<string>,
  ): void {
    const parentIndent = leadingWhitespace(pass.lines[parentLineNumber] ?? '');
    const newLines = this.buildChildLines(pass, parentTaskId, parentBlockId, `${parentIndent}\t`, alreadyLinked);

    if (newLines.length === 0) {
      return;
    }

    const span = subtreeSpan(pass.lines, parentLineNumber);

    pass.blocks.push({
      taskLineNumber: parentLineNumber,
      expectedTaskLine: pass.lines[parentLineNumber],
      startLine: span.startLine,
      lineCount: span.endLineExclusive - span.startLine,
      replacementLines: [...pass.lines.slice(span.startLine, span.endLineExclusive), ...newLines],
    });
    pass.outcome.pulled += newLines.length;
  }

  /** Recurses so a remote-only chain several levels deep is pulled in together, in one pass. */
  private buildChildLines(
    pass: SyncPass,
    parentTaskId: string,
    parentBlockId: string,
    childIndent: string,
    alreadyLinked: Set<string>,
  ): string[] {
    const lines: string[] = [];

    for (const task of pass.remoteTasks.values()) {
      if (task.parentId !== parentTaskId || alreadyLinked.has(task.id)) {
        continue;
      }

      const blockId = createBlockId(pass.takenBlockIds, undefined, this.getDeviceTag());
      pass.takenBlockIds.add(blockId);
      alreadyLinked.add(task.id);

      this.links.set({
        blockId,
        providerTaskId: task.id,
        lastSyncedTitle: task.title,
        lastSyncedParentBlockId: parentBlockId,
      });

      lines.push(formatTaskLine({ prefix: `${childIndent}- `, checkbox: ' ', title: task.title, tags: [], blockId }));
      lines.push(...this.buildChildLines(pass, task.id, blockId, `${childIndent}\t`, alreadyLinked));
    }

    return lines;
  }
}
