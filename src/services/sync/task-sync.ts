import { Logger } from '../../utils/logger';
import { ProviderTask, TaskProvider } from '../task-provider';
import { CrossFileParentSync } from './cross-file-parent-sync';
import { GracePeriod } from './grace-period';
import { LineLinker } from './line-linker';
import { LinkedLineSync } from './linked-line-sync';
import { MissingLineSync } from './missing-line-sync';
import { hasAnyEdit } from './note-edits';
import { OrphanHousekeeping } from './orphan-housekeeping';
import { NoteFailureReporter } from './note-failure-reporter';
import { OrphanTracker } from './orphan-tracker';
import { ResolvedProject, resolveProject } from './project-resolver';
import { RemoteChildSync } from './remote-child-sync';
import { runThenCommit } from './run-then-commit';
import { SourceNote } from './source-note';
import { SyncOutcome, emptyOutcome, mergeOutcomes } from './sync-outcome';
import {
  LineUnderSync,
  LinkedLine,
  NoteSnapshot,
  PendingRelocation,
  SyncPass,
  collectedEdits,
  createSyncPass,
  recordRemoval,
} from './sync-pass';
import { ParsedTaskLine, parseTaskLine } from './task-line';
import { TaskLinkStore, linkIds } from './task-links';

const logger = new Logger('TaskBridge:Sync');

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
  /** The path of the in-scope file currently anchoring a block id, if any — used to relocate a
   *  task whose remote parent lives in a different note than its own line. */
  readonly locateParentFile?: (blockId: string) => string | undefined;
}

/** One run's project and scope, and what the run has found and done so far. */
interface RunScope {
  readonly project: ResolvedProject;
  readonly paths: readonly string[];
  readonly scannedBlockIds: Set<string>;
  readonly pendingRelocations: PendingRelocation[];
  readonly outcomes: SyncOutcome[];
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
  private readonly crossFileParentSync: CrossFileParentSync;
  private readonly orphanHousekeeping: OrphanHousekeeping;
  private readonly noteFailures: NoteFailureReporter;
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
    this.lineSync = new LinkedLineSync(this.provider, this.links, dependencies.locateParentFile ?? (() => undefined));
    this.lineLinker = new LineLinker(this.provider, this.links, getDeviceTag);
    this.missingLineSync = new MissingLineSync({
      provider: this.provider,
      links: this.links,
      grace: new GracePeriod(CREATION_GRACE_PERIOD_MS),
      noteFor: this.noteFor,
      existsOutsideIgnoredFiles: dependencies.existsOutsideIgnoredFiles ?? (() => false),
    });
    this.remoteChildSync = new RemoteChildSync(this.links, getDeviceTag);
    this.crossFileParentSync = new CrossFileParentSync({ links: this.links, noteFor: this.noteFor });
    this.orphanHousekeeping = new OrphanHousekeeping(this.provider, this.links, orphans);
    this.noteFailures = new NoteFailureReporter(this.links);
  }

  async run(configuredProjectId: string): Promise<SyncOutcome> {
    const project = await resolveProject(this.provider, configuredProjectId);
    const scope: RunScope = {
      project,
      paths: this.filesInScope(),
      scannedBlockIds: new Set(),
      pendingRelocations: [],
      outcomes: [],
    };

    logRunStart(scope);
    await runThenCommit(() => this.syncScope(scope), () => this.commitRun(scope));

    const outcome = mergeOutcomes(scope.outcomes, project.resolution);

    return { ...outcome, filesScanned: scope.paths.length, linkedTasks: this.links.size };
  }

  /**
   * A note that fails to sync — a vault error, or a provider call failing partway through it — does
   * not stop the run: `runFilePass` reports its own failure and still hands back whatever it got
   * done, so every other note keeps being synced and the missing-line and orphan sweeps still run
   * against everything that succeeded.
   */
  private async syncScope(scope: RunScope): Promise<void> {
    for (const path of scope.paths) {
      scope.outcomes.push(await this.runFilePass(scope, path));
    }

    const relocated = await this.crossFileParentSync.run(scope.pendingRelocations);
    scope.outcomes.push({ ...emptyOutcome(scope.project.resolution), pulled: relocated });

    const context = { project: scope.project, takenBlockIds: scope.scannedBlockIds, scannedPaths: scope.paths };
    scope.outcomes.push(await this.missingLineSync.run(context));
  }

  /** Links are saved before housekeeping, since an unsaved link would get its task created a second time. */
  private async commitRun(scope: RunScope): Promise<void> {
    this.creationGrace.sweep();
    await this.saveLinks();
    scope.outcomes.push(await this.orphanHousekeeping.run(scope.project, scope.scannedBlockIds));
  }

  /**
   * One file's whole pass: sync every line, pull remote-only children, then commit its own edits.
   * A failure anywhere in this — reading the note, or a provider call partway through syncing it —
   * is reported rather than thrown, so this still hands back whatever the pass got done and the
   * caller can move on to the next file.
   */
  private async runFilePass(scope: RunScope, path: string): Promise<SyncOutcome> {
    const snapshot = await this.readNote(scope, path);

    if (snapshot === undefined) {
      return emptyOutcome(scope.project.resolution);
    }

    const pass = createSyncPass(scope.project, snapshot, path);
    await this.syncAndCommit(scope, path, pass);

    logger.debug('Note synced', { path, outcome: pass.outcome });
    return pass.outcome;
  }

  private async readNote(scope: RunScope, path: string): Promise<NoteSnapshot | undefined> {
    const note = this.noteFor(path);

    try {
      const [content, modifiedAt] = await Promise.all([note.read(), note.lastModified()]);
      return { content, modifiedAt };
    } catch (error) {
      this.noteFailures.report(path, error, scope.scannedBlockIds);
      return undefined;
    }
  }

  private async syncAndCommit(scope: RunScope, path: string, pass: SyncPass): Promise<void> {
    const note = this.noteFor(path);

    try {
      await runThenCommit(
        async () => {
          await this.syncEveryLine(pass, note);
          this.remoteChildSync.run(pass);
        },
        async () => {
          // Kept even if syncing failed: a line given a block id but never written would be created again.
          pass.takenBlockIds.forEach((blockId) => scope.scannedBlockIds.add(blockId));
          scope.pendingRelocations.push(...pass.pendingParentRelocations);
          this.recordLastKnownFile(pass, path);
          pass.outcome.skippedEdits += await writeCollectedEdits(note, pass);
        },
      );
      this.noteFailures.clear(path);
    } catch (error) {
      this.noteFailures.report(path, error, scope.scannedBlockIds);
    }
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

  private async syncEveryLine(pass: SyncPass, note: SourceNote): Promise<void> {
    for (let lineNumber = 0; lineNumber < pass.lines.length; lineNumber += 1) {
      await this.syncLine(pass, lineNumber, note);
    }
  }

  private async syncLine(pass: SyncPass, lineNumber: number, note: SourceNote): Promise<void> {
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
      await this.createOrRelink(line, note);
      return;
    }

    await this.syncAgainstLink({ line, link });
  }

  private async createOrRelink(line: LineUnderSync, note: SourceNote): Promise<void> {
    const relinked = this.lineLinker.relinkIfAlreadyAnchored(line);

    if (relinked !== undefined) {
      await this.syncAgainstLink(relinked);
      return;
    }

    if (line.task.blockId !== undefined && this.creationGrace.isPending(line.task.blockId)) {
      logger.debug('New line waiting out the creation grace period', { blockId: line.task.blockId });
      return;
    }

    await this.lineLinker.create(line, note);
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

    logger.info('Removing the line of a task deleted in Todoist', linkIds(link));
    recordRemoval(line);
    this.links.delete(link.blockId);
    line.pass.outcome.removedLine += 1;
  }

  /**
   * A task the active-list fetch didn't return but a direct lookup still finds — completed, moved
   * to another project, or both — still carries this plugin's block id, so it keeps syncing exactly
   * like a task found in the configured project.
   */
  private async syncAgainstTaskFoundElsewhere(linked: LinkedLine, found: ProviderTask): Promise<void> {
    await this.lineSync.syncEveryField(linked, found);
  }
}

/** Resolves to how many edits were left unwritten because their lines changed while the pass ran. */
async function writeCollectedEdits(note: SourceNote, pass: SyncPass): Promise<number> {
  const edits = collectedEdits(pass);

  return hasAnyEdit(edits) ? note.applyEdits(edits) : 0;
}

function logRunStart(scope: RunScope): void {
  logger.debug('Sync run started', {
    projectId: scope.project.id,
    projectResolution: scope.project.resolution.kind,
    remoteTasks: scope.project.tasks.length,
    notesInScope: scope.paths.length,
  });
}
