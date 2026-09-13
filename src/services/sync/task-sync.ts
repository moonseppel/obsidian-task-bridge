import { Logger } from '../../utils/logger';
import { ProviderTask, TaskProvider } from '../task-provider';
import { GracePeriod } from './grace-period';
import { LineLinker } from './line-linker';
import { LinkedLineSync } from './linked-line-sync';
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
  LinkedLine,
  SyncPass,
  collectedEdits,
  createSyncPass,
  recordRemoval,
} from './sync-pass';
import { ParsedTaskLine, parseTaskLine } from './task-line';
import { TaskLinkStore, linkIds } from './task-links';

const logger = new Logger('ObsidianTaskSync:Sync');

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
  /** Whether a block id anchors a task line in some non-ignored vault file outside this run's
   *  scanned scope — the signal that tells a task merely moved out of scope from one truly gone. */
  readonly existsOutsideIgnoredFiles?: (blockId: string) => boolean;
}

export class TaskSync {
  private readonly filesInScope: () => readonly string[];
  private readonly noteFor: (path: string) => SourceNote;
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly saveLinks: () => Promise<void>;
  private readonly isTagInScope: (task: ParsedTaskLine) => boolean;
  private readonly lineSync: LinkedLineSync;
  private readonly lineLinker: LineLinker;
  private readonly missingLineSync: MissingLineSync;
  private readonly remoteChildSync: RemoteChildSync;
  private readonly orphanHousekeeping: OrphanHousekeeping;
  private readonly creationGrace = new GracePeriod(CREATION_GRACE_PERIOD_MS);

  constructor(dependencies: TaskSyncDependencies) {
    const getDeviceTag = dependencies.getDeviceTag ?? (() => '');
    const orphans = dependencies.orphans ?? new OrphanTracker();

    this.filesInScope = dependencies.filesInScope;
    this.noteFor = dependencies.noteFor;
    this.provider = dependencies.provider;
    this.links = dependencies.links;
    this.saveLinks = dependencies.saveLinks;
    this.isTagInScope = dependencies.isTagInScope ?? (() => true);
    this.lineSync = new LinkedLineSync(this.provider, this.links);
    this.lineLinker = new LineLinker(this.provider, this.links, getDeviceTag);
    this.missingLineSync = new MissingLineSync({
      provider: this.provider,
      links: this.links,
      grace: new GracePeriod(CREATION_GRACE_PERIOD_MS),
      noteFor: this.noteFor,
      existsOutsideIgnoredFiles: dependencies.existsOutsideIgnoredFiles ?? (() => false),
    });
    this.remoteChildSync = new RemoteChildSync(this.links, getDeviceTag);
    this.orphanHousekeeping = new OrphanHousekeeping(this.provider, this.links, orphans);
  }

  async run(configuredProjectId: string): Promise<SyncOutcome> {
    const project = await resolveProject(this.provider, configuredProjectId);
    const paths = this.filesInScope();
    const scannedBlockIds = new Set<string>();
    const outcomes: SyncOutcome[] = [];
    logRunStart(project, paths);

    try {
      for (const path of paths) {
        outcomes.push(await this.runFilePass(project, path, scannedBlockIds));
      }

      outcomes.push(await this.missingLineSync.run({ project, takenBlockIds: scannedBlockIds, scannedPaths: paths }));
    } finally {
      this.creationGrace.sweep();
      // Saved before housekeeping, even if the work above threw: an unsaved link would get its task created twice.
      await this.saveLinks();
      outcomes.push(await this.orphanHousekeeping.run(project, scannedBlockIds));
    }

    return { ...mergeOutcomes(outcomes, project.resolution), filesScanned: paths.length, linkedTasks: this.links.size };
  }

  /** One file's whole pass: sync every line, pull remote-only children, then commit its own edits. */
  private async runFilePass(
    project: ResolvedProject,
    path: string,
    scannedBlockIds: Set<string>,
  ): Promise<SyncOutcome> {
    const note = this.noteFor(path);
    const [content, modifiedAt] = await Promise.all([note.read(), note.lastModified()]);
    const pass = createSyncPass(project, { content, modifiedAt });

    try {
      await this.syncEveryLine(pass);
      this.remoteChildSync.run(pass);
    } finally {
      // Committed even when the work above threw: a line already given a block id would otherwise
      // never be written, and the next pass would try to create it again.
      pass.takenBlockIds.forEach((blockId) => scannedBlockIds.add(blockId));
      this.recordLastKnownFile(pass, path);
      pass.outcome.skippedEdits += await writeCollectedEdits(note, pass);
    }

    logger.debug('Note synced', { path, outcome: pass.outcome });
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

    if (task === undefined || task.title.length === 0 || !this.isTagInScope(task)) {
      return;
    }

    if (task.blockId !== undefined) {
      pass.blockIdByLineNumber.set(lineNumber, task.blockId);
    }

    const line: LineUnderSync = { pass, lineNumber, original, task };
    const link = task.blockId === undefined ? undefined : this.links.get(task.blockId);

    if (link === undefined) {
      await this.createOrRelink(line);
      return;
    }

    await this.syncAgainstLink({ line, link });
  }

  private async createOrRelink(line: LineUnderSync): Promise<void> {
    const relinked = this.lineLinker.relinkIfAlreadyAnchored(line);

    if (relinked !== undefined) {
      await this.syncAgainstLink(relinked);
      return;
    }

    if (line.task.blockId !== undefined && this.creationGrace.isPending(line.task.blockId)) {
      logger.debug('New line waiting out the creation grace period', { blockId: line.task.blockId });
      return;
    }

    await this.lineLinker.create(line);
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
      await this.syncAgainstTaskFoundElsewhere(linked, found);
      return;
    }

    if (line.task.title !== link.lastSyncedTitle) {
      await this.lineLinker.recreate(linked);
      return;
    }

    logger.debug('Linked task was deleted remotely; removing its line', linkIds(link));
    recordRemoval(line);
    this.links.delete(link.blockId);
    line.pass.outcome.removedLine += 1;
  }

  /** Completed in this project is pulled into the checkbox; anything else is left exactly as it is. */
  private async syncAgainstTaskFoundElsewhere(linked: LinkedLine, found: ProviderTask): Promise<void> {
    if (found.projectId === linked.line.pass.projectId && found.isCompleted) {
      await this.lineSync.syncCompletion(linked, { isDone: true, updatedAt: found.updatedAt });
      return;
    }

    logger.debug('Linked task is still active elsewhere; leaving line and link alone', linkIds(linked.link));
  }
}

/** Resolves to how many edits were left unwritten because their lines changed while the pass ran. */
async function writeCollectedEdits(note: SourceNote, pass: SyncPass): Promise<number> {
  const edits = collectedEdits(pass);

  return hasAnyEdit(edits) ? note.applyEdits(edits) : 0;
}

function logRunStart(project: ResolvedProject, paths: readonly string[]): void {
  logger.debug('Sync run started', {
    projectId: project.id,
    projectResolution: project.resolution.kind,
    remoteTasks: project.tasks.length,
    notesInScope: paths.length,
  });
}
