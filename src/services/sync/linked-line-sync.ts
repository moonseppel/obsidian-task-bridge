import { ProviderTask, TaskProvider } from '../task-provider';
import { FieldChange, syncField } from './field-sync';
import { ParentSync } from './parent-sync';
import { LinkedLine, recordBlockEdit, recordTaskEdit } from './sync-pass';
import { canonicalTags, sameTagSet } from './tag-set';
import {
  DescriptionBlock,
  composeRemoteDescription,
  extractUserDescription,
  leadingWhitespace,
  readDescriptionBlock,
  renderDescriptionBlock,
} from './task-description';
import { isDone, isRepresentableAsTag } from './task-line';
import { TaskLinkStore } from './task-links';

export interface RemoteCompletion {
  readonly isDone: boolean;
  readonly updatedAt: number | undefined;
}

export class LinkedLineSync {
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly parentSync: ParentSync;

  constructor(provider: TaskProvider, links: TaskLinkStore) {
    this.provider = provider;
    this.links = links;
    this.parentSync = new ParentSync(provider, links);
  }

  async syncEveryField(linked: LinkedLine, remoteTask: ProviderTask): Promise<void> {
    await this.syncTitle(linked, remoteTask);
    // Not completed by construction: the active list this pass fetched excludes completed tasks.
    // A completion that made the task disappear reaches syncCompletion by another route.
    await this.syncCompletion(this.reread(linked), { isDone: false, updatedAt: remoteTask.updatedAt });
    await this.syncDescription(this.reread(linked), remoteTask);
    await this.syncTags(this.reread(linked), remoteTask);
    await this.parentSync.sync(this.reread(linked), remoteTask);
  }

  async syncCompletion(linked: LinkedLine, remote: RemoteCompletion): Promise<void> {
    const { line, link } = linked;
    const localDone = isDone(line.task);

    await syncField(line, {
      field: 'completion',
      local: localDone,
      remote: remote.isDone,
      lastSynced: link.lastSyncedDone ?? false,
      remoteUpdatedAt: remote.updatedAt,
      settle: () => this.links.set({ ...link, lastSyncedDone: remote.isDone }),
      push: () => this.pushDone(linked, localDone),
      pull: () => this.pullDone(linked, remote.isDone),
    });
  }

  /** An earlier field may have just rewritten the link; the next must merge onto it, not revert it. */
  private reread(linked: LinkedLine): LinkedLine {
    return { line: linked.line, link: this.links.get(linked.link.blockId) ?? linked.link };
  }

  private async syncTitle(linked: LinkedLine, remoteTask: ProviderTask): Promise<void> {
    const { link } = linked;
    // An empty remote title never counts as a change: it would blank the line rather than rename it.
    const remote = remoteTask.title.length > 0 ? remoteTask.title : link.lastSyncedTitle;

    await syncField(linked.line, {
      field: 'title',
      local: linked.line.task.title,
      remote,
      lastSynced: link.lastSyncedTitle,
      remoteUpdatedAt: remoteTask.updatedAt,
      settle: () => this.links.set({ ...link, lastSyncedTitle: remote }),
      push: () => this.pushTitle(linked),
      pull: () => this.pullTitle(linked, remote),
    });
  }

  private async syncDescription(linked: LinkedLine, remoteTask: ProviderTask): Promise<void> {
    const { line, link } = linked;
    const localBlock = readDescriptionBlock(line.pass.lines, line.lineNumber);
    const remote = extractUserDescription(remoteTask.description);

    await syncField(line, {
      field: 'description',
      local: localBlock.text,
      remote,
      lastSynced: link.lastSyncedDescription ?? '',
      remoteUpdatedAt: remoteTask.updatedAt,
      settle: () => this.links.set({ ...link, lastSyncedDescription: remote }),
      push: () => this.pushDescription(linked, localBlock.text),
      pull: () => this.pullDescription(linked, localBlock, remote),
    });
  }

  /** A label no `#tag` could express is dropped before comparing, so it is left alone every pass. */
  private async syncTags(linked: LinkedLine, remoteTask: ProviderTask): Promise<void> {
    const { line, link } = linked;
    const local = line.task.tags;
    const remote = remoteTask.labels.filter(isRepresentableAsTag);
    const unsyncable = remoteTask.labels.filter((label) => !isRepresentableAsTag(label));

    const change: FieldChange<readonly string[]> = {
      field: 'tags',
      local,
      remote,
      lastSynced: link.lastSyncedTags ?? [],
      remoteUpdatedAt: remoteTask.updatedAt,
      equals: sameTagSet,
      settle: () => this.links.set({ ...link, lastSyncedTags: canonicalTags(remote) }),
      push: () => this.pushTags(linked, local, unsyncable),
      pull: () => this.pullTags(linked, remote),
    };

    await syncField(line, change);
  }

  private async pushTitle(linked: LinkedLine): Promise<void> {
    const { line, link } = linked;

    await this.provider.updateTaskTitle(link.providerTaskId, line.task.title);
    this.links.set({ ...link, lastSyncedTitle: line.task.title });
    line.pass.outcome.pushed += 1;
  }

  private pullTitle(linked: LinkedLine, title: string): void {
    const { line, link } = linked;

    this.links.set({ ...link, lastSyncedTitle: title });
    recordTaskEdit(line, { title });
    line.pass.outcome.pulled += 1;
  }

  private async pushDone(linked: LinkedLine, done: boolean): Promise<void> {
    const { line, link } = linked;

    await (done ? this.provider.completeTask(link.providerTaskId) : this.provider.reopenTask(link.providerTaskId));
    this.links.set({ ...link, lastSyncedDone: done });
    line.pass.outcome.pushed += 1;
  }

  private pullDone(linked: LinkedLine, done: boolean): void {
    const { line, link } = linked;

    this.links.set({ ...link, lastSyncedDone: done });
    recordTaskEdit(line, { checkbox: done ? 'x' : ' ' });
    line.pass.outcome.pulled += 1;
  }

  private async pushDescription(linked: LinkedLine, text: string): Promise<void> {
    const { line, link } = linked;

    await this.provider.updateTaskDescription(link.providerTaskId, composeRemoteDescription(text, link.blockId));
    this.links.set({ ...link, lastSyncedDescription: text });
    line.pass.outcome.pushed += 1;
  }

  private pullDescription(linked: LinkedLine, currentBlock: DescriptionBlock, text: string): void {
    const { line, link } = linked;

    this.links.set({ ...link, lastSyncedDescription: text });
    recordBlockEdit(line, {
      startLine: currentBlock.startLine,
      lineCount: currentBlock.lineCount,
      lines: renderDescriptionBlock(leadingWhitespace(line.original), text),
    });
    line.pass.outcome.pulled += 1;
  }

  /** The provider replaces the whole label list, so labels this plugin never synced are sent back too. */
  private async pushTags(
    linked: LinkedLine,
    tags: readonly string[],
    unsyncableLabels: readonly string[],
  ): Promise<void> {
    const { line, link } = linked;

    await this.provider.updateTaskLabels(link.providerTaskId, [...tags, ...unsyncableLabels]);
    this.links.set({ ...link, lastSyncedTags: canonicalTags(tags) });
    line.pass.outcome.pushed += 1;
  }

  private pullTags(linked: LinkedLine, tags: readonly string[]): void {
    const { line, link } = linked;

    this.links.set({ ...link, lastSyncedTags: canonicalTags(tags) });
    recordTaskEdit(line, { tags: [...tags] });
    line.pass.outcome.pulled += 1;
  }
}
