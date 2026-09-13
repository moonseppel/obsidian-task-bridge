import { TaskProvider } from '../task-provider';
import { createBlockId } from './block-id';
import { GracePeriod } from './grace-period';
import { LinkedLine, LinkedLineSync } from './linked-line-sync';
import { MissingLineSync } from './missing-line-sync';
import { hasAnyEdit } from './note-edits';
import { OrphanHousekeeping } from './orphan-housekeeping';
import { OrphanTracker } from './orphan-tracker';
import { ResolvedProject, resolveProject } from './project-resolver';
import { RemoteChildSync } from './remote-child-sync';
import { SourceNote } from './source-note';
import { SyncOutcome, mergeOutcomes } from './sync-outcome';
import {
  LineUnderSync,
  SyncPass,
  collectedEdits,
  createSyncPass,
  flushPendingAppends,
  localParentBlockId,
  recordEdit,
  recordRemoval,
} from './sync-pass';
import { canonicalTags } from './tag-set';
import { composeRemoteDescription, readDescriptionBlock } from './task-description';
import { ParsedTaskLine, formatTaskLine, parseTaskLine } from './task-line';
import { TaskLinkStore } from './task-links';

/** A vault-sync tool can deliver `data.json` behind the note, so neither an unrecognized block id
 * nor a vanished line is acted on until it has looked that way for this long. */
const CREATION_GRACE_PERIOD_MS = 60_000;

export interface TaskSyncDependencies {
  /** Every file path currently in scope, resolved fresh at the start of each run. */
  readonly filesInScope: () => readonly string[];
  readonly noteFor: (path: string) => SourceNote;
  readonly provider: TaskProvider;
  readonly links: TaskLinkStore;
  readonly saveLinks: () => Promise<void>;
  readonly getDeviceTag?: () => string;
  readonly orphans?: OrphanTracker;
  /** A task line not passing this predicate is skipped entirely, as if it were not there. */
  readonly isTagInScope?: (task: ParsedTaskLine) => boolean;
}

export class TaskSync {
  private readonly filesInScope: () => readonly string[];
  private readonly noteFor: (path: string) => SourceNote;
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly saveLinks: () => Promise<void>;
  private readonly getDeviceTag: () => string;
  private readonly isTagInScope: (task: ParsedTaskLine) => boolean;
  private readonly lineSync: LinkedLineSync;
  private readonly missingLineSync: MissingLineSync;
  private readonly remoteChildSync: RemoteChildSync;
  private readonly orphanHousekeeping: OrphanHousekeeping;
  private readonly creationGrace = new GracePeriod(CREATION_GRACE_PERIOD_MS);

  constructor(dependencies: TaskSyncDependencies) {
    const orphans = dependencies.orphans ?? new OrphanTracker();

    this.filesInScope = dependencies.filesInScope;
    this.noteFor = dependencies.noteFor;
    this.provider = dependencies.provider;
    this.links = dependencies.links;
    this.saveLinks = dependencies.saveLinks;
    this.getDeviceTag = dependencies.getDeviceTag ?? (() => '');
    this.isTagInScope = dependencies.isTagInScope ?? (() => true);
    this.lineSync = new LinkedLineSync(this.provider, this.links);
    this.missingLineSync = new MissingLineSync(
      this.provider,
      this.links,
      new GracePeriod(CREATION_GRACE_PERIOD_MS),
      this.noteFor,
    );
    this.remoteChildSync = new RemoteChildSync(this.links, this.getDeviceTag);
    this.orphanHousekeeping = new OrphanHousekeeping(this.provider, this.links, orphans);
  }

  async run(configuredProjectId: string): Promise<SyncOutcome> {
    const project = await resolveProject(this.provider, configuredProjectId);
    const paths = this.filesInScope();
    const runWideTakenBlockIds = new Set<string>();
    const outcomes: SyncOutcome[] = [];

    try {
      for (const path of paths) {
        outcomes.push(await this.runFilePass(project, path, runWideTakenBlockIds));
      }

      outcomes.push(
        await this.missingLineSync.run({ project, takenBlockIds: runWideTakenBlockIds, scannedPaths: paths }),
      );
    } finally {
      this.creationGrace.sweep();
      // Committed even when the work above threw: a provider task whose link went unsaved would be
      // created a second time next pass, and housekeeping must not risk what already succeeded.
      await this.saveLinks();
      await this.orphanHousekeeping.run(project.tasks, project.id);
    }

    return mergeOutcomes(outcomes, project.resolution);
  }

  /** One file's whole pass: sync every line, pull remote-only children, then commit its own edits. */
  private async runFilePass(
    project: ResolvedProject,
    path: string,
    runWideTakenBlockIds: Set<string>,
  ): Promise<SyncOutcome> {
    const note = this.noteFor(path);
    const [content, modifiedAt] = await Promise.all([note.read(), note.lastModified()]);
    const pass = createSyncPass(project, { content, modifiedAt });

    try {
      await this.syncEveryLine(pass);
      this.remoteChildSync.run(pass);
      flushPendingAppends(pass);
    } finally {
      // Committed even when the work above threw: a line already given a block id would otherwise
      // never be written, and the next pass would try to create it again.
      for (const blockId of pass.takenBlockIds) {
        runWideTakenBlockIds.add(blockId);
      }

      this.recordLastKnownFile(pass, path);

      const edits = collectedEdits(pass);

      if (hasAnyEdit(edits)) {
        await note.applyEdits(edits);
      }
    }

    return pass.outcome;
  }

  /** Lets a later run's missing-line sweep resurrect a deleted-but-conflicting line into the right file. */
  private recordLastKnownFile(pass: SyncPass, path: string): void {
    for (const blockId of pass.blockIdByLineNumber.values()) {
      const link = this.links.get(blockId);

      if (link !== undefined && link.lastKnownFilePath !== path) {
        this.links.set({ ...link, lastKnownFilePath: path });
      }
    }
  }

  private async syncEveryLine(pass: SyncPass): Promise<void> {
    for (let lineNumber = 0; lineNumber < pass.lines.length; lineNumber += 1) {
      await this.syncLine(pass, lineNumber);
    }
  }

  private async syncLine(pass: SyncPass, lineNumber: number): Promise<void> {
    const original = pass.lines[lineNumber];
    const task = parseTaskLine(original);

    if (task === null || task.title.length === 0 || !this.isTagInScope(task)) {
      return;
    }

    if (task.blockId !== null) {
      pass.blockIdByLineNumber.set(lineNumber, task.blockId);
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
    pass.blockIdByLineNumber.set(line.lineNumber, blockId);

    await this.createAndLink(line, blockId);
    pass.takenBlockIds.add(blockId);
    recordEdit(line, formatTaskLine({ ...task, blockId }));
    pass.outcome.created += 1;
  }

  /** Written together: a task whose link went unsaved is created again on the next pass. */
  private async createAndLink(line: LineUnderSync, blockId: string): Promise<void> {
    const { pass, task } = line;
    const description = readDescriptionBlock(pass.lines, line.lineNumber).text;
    // Undefined unless the parent line is already linked, so a parent still waiting out its own
    // creation grace period is simply created as top-level for now, corrected the next pass.
    const parentBlockId = localParentBlockId(pass, line.lineNumber);
    const parentTaskId = parentBlockId === undefined ? undefined : this.links.get(parentBlockId)?.providerTaskId;
    const resolvedParentBlockId = parentTaskId === undefined ? undefined : parentBlockId;
    const created = await this.provider.createTask({
      title: task.title,
      projectId: pass.projectId,
      description: composeRemoteDescription(description, blockId),
      labels: task.tags,
      parentId: parentTaskId,
    });

    this.links.set({
      blockId,
      providerTaskId: created.id,
      lastSyncedTitle: task.title,
      lastSyncedDescription: description,
      lastSyncedTags: canonicalTags(task.tags),
      lastSyncedParentBlockId: resolvedParentBlockId,
    });
  }
}
