import { TaskProvider } from '../task-provider';
import { createBlockId } from './block-id';
import { GracePeriod } from './grace-period';
import { LinkedLine, LinkedLineSync } from './linked-line-sync';
import { MissingLineSync } from './missing-line-sync';
import { hasAnyEdit } from './note-edits';
import { OrphanHousekeeping } from './orphan-housekeeping';
import { OrphanTracker } from './orphan-tracker';
import { resolveProject } from './project-resolver';
import { SourceNote } from './source-note';
import { SyncOutcome } from './sync-outcome';
import { LineUnderSync, SyncPass, collectedEdits, createSyncPass, recordEdit, recordRemoval } from './sync-pass';
import { canonicalTags } from './tag-set';
import { composeRemoteDescription, readDescriptionBlock } from './task-description';
import { formatTaskLine, parseTaskLine } from './task-line';
import { TaskLinkStore } from './task-links';

/** A vault-sync tool can deliver `data.json` behind the note, so neither an unrecognized block id
 * nor a vanished line is acted on until it has looked that way for this long. */
const CREATION_GRACE_PERIOD_MS = 60_000;

export interface TaskSyncDependencies {
  readonly note: SourceNote;
  readonly provider: TaskProvider;
  readonly links: TaskLinkStore;
  readonly saveLinks: () => Promise<void>;
  readonly getDeviceTag?: () => string;
  readonly orphans?: OrphanTracker;
}

export class TaskSync {
  private readonly note: SourceNote;
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly saveLinks: () => Promise<void>;
  private readonly getDeviceTag: () => string;
  private readonly lineSync: LinkedLineSync;
  private readonly missingLineSync: MissingLineSync;
  private readonly orphanHousekeeping: OrphanHousekeeping;
  private readonly creationGrace = new GracePeriod(CREATION_GRACE_PERIOD_MS);

  constructor(dependencies: TaskSyncDependencies) {
    const orphans = dependencies.orphans ?? new OrphanTracker();

    this.note = dependencies.note;
    this.provider = dependencies.provider;
    this.links = dependencies.links;
    this.saveLinks = dependencies.saveLinks;
    this.getDeviceTag = dependencies.getDeviceTag ?? (() => '');
    this.lineSync = new LinkedLineSync(this.provider, this.links);
    this.missingLineSync = new MissingLineSync(
      this.provider,
      this.links,
      new GracePeriod(CREATION_GRACE_PERIOD_MS),
    );
    this.orphanHousekeeping = new OrphanHousekeeping(this.provider, this.links, orphans);
  }

  async run(configuredProjectId: string): Promise<SyncOutcome> {
    const project = await resolveProject(this.provider, configuredProjectId);
    const [content, modifiedAt] = await Promise.all([this.note.read(), this.note.lastModified()]);
    const pass = createSyncPass(project, { content, modifiedAt });

    try {
      await this.syncEveryLine(pass);
      await this.missingLineSync.run(pass);
    } finally {
      this.creationGrace.sweep();
      // Committed even when the work above threw: a provider task whose link went unsaved would be
      // created a second time next pass, and housekeeping must not risk what already succeeded.
      await this.commit(pass);
      await this.orphanHousekeeping.run(pass.remoteTasks.values());
    }

    return pass.outcome;
  }

  private async syncEveryLine(pass: SyncPass): Promise<void> {
    for (let lineNumber = 0; lineNumber < pass.lines.length; lineNumber += 1) {
      await this.syncLine(pass, lineNumber);
    }
  }

  private async syncLine(pass: SyncPass, lineNumber: number): Promise<void> {
    const original = pass.lines[lineNumber];
    const task = parseTaskLine(original);

    if (task === null || task.title.length === 0) {
      return;
    }

    const line: LineUnderSync = { pass, lineNumber, original, task };
    const link = task.blockId === null ? undefined : this.links.get(task.blockId);

    if (link === undefined) {
      await this.createOrRelink(line);
      return;
    }

    await this.syncAgainstLink({ line, link });
  }

  private async createOrRelink(line: LineUnderSync): Promise<void> {
    const relinked = this.relinkIfAlreadyAnchored(line);

    if (relinked !== undefined) {
      await this.syncAgainstLink(relinked);
      return;
    }

    if (line.task.blockId !== null && this.creationGrace.isPending(line.task.blockId)) {
      return;
    }

    await this.createTask(line);
  }

  /** Searches the task list already in hand rather than creating a second task for the same line. */
  private relinkIfAlreadyAnchored(line: LineUnderSync): LinkedLine | undefined {
    const { blockId } = line.task;

    if (blockId === null) {
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

  private async syncAgainstLink(linked: LinkedLine): Promise<void> {
    const remoteTask = linked.line.pass.remoteTasks.get(linked.link.providerTaskId);

    if (remoteTask === undefined) {
      await this.syncAgainstMissingRemoteTask(linked);
      return;
    }

    await this.lineSync.syncEveryField(linked, remoteTask);
  }

  /**
   * Todoist's active list excludes a completed task exactly as it excludes a deleted one, so
   * absence is ambiguous and costs a direct lookup before anything destructive happens.
   */
  private async syncAgainstMissingRemoteTask(linked: LinkedLine): Promise<void> {
    const { line, link } = linked;
    const found = await this.provider.getTask(link.providerTaskId);

    if (found !== undefined) {
      if (found.projectId === line.pass.projectId && found.isCompleted) {
        await this.lineSync.syncCompletion(linked, { isDone: true, updatedAt: found.updatedAt });
      }

      return;
    }

    if (line.task.title !== link.lastSyncedTitle) {
      await this.recreateTask(linked);
      return;
    }

    recordRemoval(line);
    this.links.delete(link.blockId);
    line.pass.outcome.removedLine += 1;
  }

  /** A deleted task leaves no timestamp to compare, so the missing-timestamp rule hands it to local. */
  private async recreateTask(linked: LinkedLine): Promise<void> {
    const { line, link } = linked;

    await this.createAndLink(line, link.blockId);
    line.pass.outcome.conflicted += 1;
    line.pass.outcome.recreatedTask += 1;
  }

  private async createTask(line: LineUnderSync): Promise<void> {
    const { pass, task } = line;
    // Reused, never replaced, so one task can never end up with two anchors on its line.
    const blockId = task.blockId ?? createBlockId(pass.takenBlockIds, undefined, this.getDeviceTag());

    await this.createAndLink(line, blockId);
    pass.takenBlockIds.add(blockId);
    recordEdit(line, formatTaskLine({ ...task, blockId }));
    pass.outcome.created += 1;
  }

  /** Written together: a task whose link went unsaved is created again on the next pass. */
  private async createAndLink(line: LineUnderSync, blockId: string): Promise<void> {
    const { pass, task } = line;
    const description = readDescriptionBlock(pass.lines, line.lineNumber).text;
    const created = await this.provider.createTask({
      title: task.title,
      projectId: pass.projectId,
      description: composeRemoteDescription(description, blockId),
      labels: task.tags,
    });

    this.links.set({
      blockId,
      providerTaskId: created.id,
      lastSyncedTitle: task.title,
      lastSyncedDescription: description,
      lastSyncedTags: canonicalTags(task.tags),
    });
  }

  private async commit(pass: SyncPass): Promise<void> {
    const edits = collectedEdits(pass);

    if (hasAnyEdit(edits)) {
      await this.note.applyEdits(edits);
    }

    await this.saveLinks();
  }
}
