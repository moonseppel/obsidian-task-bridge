import { ProviderProject, ProviderTask, TaskProvider, defaultProjectOf } from '../task-provider';
import { createBlockId } from './block-id';
import { OrphanTracker } from './orphan-tracker';
import { orphanNoticeDescription } from './orphan-notice';
import { TaskLink, TaskLinkStore } from './task-links';
import { ParsedTaskLine, collectBlockIds, formatTaskLine, parseTaskLine } from './task-line';

/**
 * A vault-sync tool can deliver data.json slightly behind the note, so a block id that only just
 * became unrecognized is given this long to turn up in a re-link lookup before it is treated as
 * a genuinely new task.
 */
const CREATION_GRACE_PERIOD_MS = 60_000;
/** How long a task stays orphaned before its description is flagged with a removal notice. */
const ORPHAN_FLAG_AFTER_MS = 60 * 60_000;
/** How long a flagged orphan is given to be re-linked before it is actually removed. */
const ORPHAN_REMOVAL_GRACE_MS = 2 * 24 * 60 * 60_000;

/** Replaces one line only if it still reads as it did when the pass started. */
export interface LineEdit {
  readonly lineNumber: number;
  readonly expected: string;
  readonly replacement: string;
}

export interface SourceNote {
  read(): Promise<string>;
  /** Epoch ms the note was last modified, so a conflict can be resolved by recency. */
  lastModified(): Promise<number>;
  applyEdits(edits: readonly LineEdit[]): Promise<void>;
}

/** How the pass arrived at the project it used, which is all a caller needs to report it. */
export type ProjectResolution =
  | { kind: 'configured' }
  | { kind: 'defaulted'; project: ProviderProject }
  | { kind: 'replaced'; project: ProviderProject };

export interface SyncOutcome {
  created: number;
  pushed: number;
  pulled: number;
  conflicted: number;
  projectResolution: ProjectResolution;
}

/** Applies only the lines that still read as they did, so a concurrent edit is never clobbered. */
export function applyLineEdits(content: string, edits: readonly LineEdit[]): string {
  const lines = content.split('\n');

  for (const edit of edits) {
    if (lines[edit.lineNumber] === edit.expected) {
      lines[edit.lineNumber] = edit.replacement;
    }
  }

  return lines.join('\n');
}

export class TitleSync {
  private readonly note: SourceNote;
  private readonly provider: TaskProvider;
  private readonly links: TaskLinkStore;
  private readonly saveLinks: () => Promise<void>;
  private readonly getDeviceTag: () => string;
  private readonly orphans: OrphanTracker;
  /** In memory only, and rebuilt from what's currently in the note each pass, so a block id that
   * disappears from the note before the grace period is up is simply dropped rather than tracked
   * forever. */
  private readonly firstSeenUnrecognized = new Map<string, number>();

  constructor(
    note: SourceNote,
    provider: TaskProvider,
    links: TaskLinkStore,
    saveLinks: () => Promise<void>,
    getDeviceTag: () => string = () => '',
    orphans: OrphanTracker = new OrphanTracker(),
  ) {
    this.note = note;
    this.provider = provider;
    this.links = links;
    this.saveLinks = saveLinks;
    this.getDeviceTag = getDeviceTag;
    this.orphans = orphans;
  }

  async run(configuredProjectId: string): Promise<SyncOutcome> {
    const project = await this.resolveProject(configuredProjectId);
    const [content, localModifiedAt] = await Promise.all([this.note.read(), this.note.lastModified()]);
    const lines = content.split('\n');
    const pass: SyncPass = {
      lines,
      projectId: project.id,
      remoteTasks: toTaskMap(project.tasks),
      remoteTasksByBlockId: toBlockIdMap(project.tasks),
      takenBlockIds: collectBlockIds(lines),
      localModifiedAt,
      pendingBlockIds: new Set(),
      edits: [],
      outcome: { created: 0, pushed: 0, pulled: 0, conflicted: 0, projectResolution: project.resolution },
    };

    try {
      await this.syncEveryLine(pass);
    } finally {
      this.forgetBlockIdsNotSeen(pass.pendingBlockIds);
      await this.updateOrphanTracking(pass.remoteTasks.values());
      // Whatever succeeded is committed even when a later call fails. A task created in the
      // provider without its link saved would be created a second time on the next pass.
      await this.commit(pass.edits);
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

    await this.syncAgainstLink(line, link);
  }

  private async createOrRelink(line: LineUnderSync): Promise<void> {
    const relinked = this.relinkIfAlreadyAnchored(line);

    if (relinked !== undefined) {
      await this.syncAgainstLink(line, relinked);
      return;
    }

    if (line.task.blockId !== null && this.stillWithinGracePeriod(line.pass, line.task.blockId)) {
      return;
    }

    await this.createTask(line);
  }

  /**
   * A line whose block id is unrecognized and unmatched is not immediately treated as new: the
   * grace period gives a lagging data.json a chance to catch up before a task is created for it.
   */
  private stillWithinGracePeriod(pass: SyncPass, blockId: string): boolean {
    pass.pendingBlockIds.add(blockId);

    const firstSeenAt = this.firstSeenUnrecognized.get(blockId);

    if (firstSeenAt === undefined) {
      this.firstSeenUnrecognized.set(blockId, Date.now());
      return true;
    }

    return Date.now() - firstSeenAt < CREATION_GRACE_PERIOD_MS;
  }

  private forgetBlockIdsNotSeen(seenThisPass: ReadonlySet<string>): void {
    for (const blockId of this.firstSeenUnrecognized.keys()) {
      if (!seenThisPass.has(blockId)) {
        this.firstSeenUnrecognized.delete(blockId);
      }
    }
  }

  /**
   * A task carrying this plugin's block id whose current link doesn't point back at it — no link
   * at all, or one that points elsewhere — is orphaned. Checked against every task in the
   * project, not just lines in the note, since re-linking (or a task simply being deleted) can
   * resolve an orphan without this note ever mentioning it.
   */
  private async updateOrphanTracking(tasks: Iterable<ProviderTask>): Promise<void> {
    const now = Date.now();
    const stillOrphaned = new Set<string>();

    for (const task of tasks) {
      if (task.embeddedBlockId === undefined) {
        continue;
      }

      const link = this.links.get(task.embeddedBlockId);

      if (link !== undefined && link.providerTaskId === task.id) {
        continue;
      }

      stillOrphaned.add(task.id);
      this.orphans.track(task.id, now);
      await this.flagIfDue(task.id, task.embeddedBlockId, now);
    }

    this.orphans.keepOnly(stillOrphaned);
  }

  /**
   * A task orphaned for less than the flag delay is left alone: a re-link lookup a pass or two
   * later resolves most of these on its own, so nothing is flagged before that grace has passed.
   */
  private async flagIfDue(providerTaskId: string, blockId: string, now: number): Promise<void> {
    const record = this.orphans.get(providerTaskId);

    if (record === undefined || record.removalDueAt !== undefined) {
      return;
    }

    if (now - record.firstSeenOrphanedAt < ORPHAN_FLAG_AFTER_MS) {
      return;
    }

    const removalDueAt = now + ORPHAN_REMOVAL_GRACE_MS;
    await this.provider.updateTaskDescription(providerTaskId, orphanNoticeDescription(blockId, removalDueAt));
    this.orphans.flag(providerTaskId, removalDueAt);
  }

  /**
   * A block id data.json doesn't recognize might already anchor a task the provider created
   * earlier — a vault-sync tool can deliver data.json slightly behind the note. Found by
   * searching the task list already in hand, never by creating a second task for the same line.
   */
  private relinkIfAlreadyAnchored(line: LineUnderSync): TaskLink | undefined {
    const { task, pass } = line;

    if (task.blockId === null) {
      return undefined;
    }

    const match = pass.remoteTasksByBlockId.get(task.blockId);

    if (match === undefined) {
      return undefined;
    }

    const link: TaskLink = { blockId: task.blockId, providerTaskId: match.id, lastSyncedTitle: match.title };
    this.links.set(link);

    return link;
  }

  /**
   * Both sides are checked against the title they last agreed on, rather than only ever asking
   * whether Obsidian changed, so a genuine conflict can be told apart from a one-sided change.
   */
  private async syncAgainstLink(line: LineUnderSync, link: TaskLink): Promise<void> {
    const remoteTask = line.pass.remoteTasks.get(link.providerTaskId);
    const remoteTitle = remoteTask?.title;
    const localChanged = line.task.title !== link.lastSyncedTitle;
    const remoteChanged =
      remoteTitle !== undefined && remoteTitle.length > 0 && remoteTitle !== link.lastSyncedTitle;

    if (localChanged && remoteChanged) {
      await this.resolveConflict(line, link, remoteTitle as string, remoteTask?.updatedAt);
      return;
    }

    if (localChanged) {
      await this.pushTitle(line, link);
      return;
    }

    if (remoteChanged) {
      this.pullTitle(line, link, remoteTitle as string);
    }
  }

  /**
   * Both sides landed on the same title independently: nothing to reconcile, so it's not a
   * conflict. Otherwise the newer side wins; when recency can't be told (the remote timestamp is
   * missing, or the two are exactly equal) the local edit wins, deterministically, so the outcome
   * never flaps from one pass to the next.
   */
  private async resolveConflict(
    line: LineUnderSync,
    link: TaskLink,
    remoteTitle: string,
    remoteUpdatedAt: number | undefined,
  ): Promise<void> {
    if (line.task.title === remoteTitle) {
      this.links.set({ ...link, lastSyncedTitle: remoteTitle });
      return;
    }

    line.pass.outcome.conflicted += 1;

    if (remoteUpdatedAt !== undefined && remoteUpdatedAt > line.pass.localModifiedAt) {
      this.pullTitle(line, link, remoteTitle);
      return;
    }

    await this.pushTitle(line, link);
  }

  private async createTask(line: LineUnderSync): Promise<void> {
    const { pass, task } = line;
    // A block id already on the line but absent from the store is reused, never replaced,
    // so a note can never end up carrying two anchors for one task.
    const blockId = task.blockId ?? createBlockId(pass.takenBlockIds, undefined, this.getDeviceTag());
    const created = await this.provider.createTask({
      title: task.title,
      projectId: pass.projectId,
      description: `^${blockId}`,
    });

    pass.takenBlockIds.add(blockId);
    this.links.set({ blockId, providerTaskId: created.id, lastSyncedTitle: task.title });
    addEdit(line, formatTaskLine({ ...task, blockId }));
    pass.outcome.created += 1;
  }

  private async pushTitle(line: LineUnderSync, link: TaskLink): Promise<void> {
    await this.provider.updateTaskTitle(link.providerTaskId, line.task.title);
    this.links.set({ ...link, lastSyncedTitle: line.task.title });
    line.pass.outcome.pushed += 1;
  }

  private pullTitle(line: LineUnderSync, link: TaskLink, remoteTitle: string): void {
    this.links.set({ ...link, lastSyncedTitle: remoteTitle });
    addEdit(line, formatTaskLine({ ...line.task, title: remoteTitle }));
    line.pass.outcome.pulled += 1;
  }

  /**
   * Syncing must never stall for want of a project, so an unset or vanished one falls back to the
   * provider's default. A project holding tasks plainly exists, which keeps the extra project
   * lookup to the only ambiguous case: an empty answer.
   */
  private async resolveProject(configuredId: string): Promise<ResolvedProject> {
    if (configuredId.length === 0) {
      return this.fallBackToDefault('defaulted');
    }

    const tasks = await this.provider.listTasks(configuredId);

    if (tasks.length > 0) {
      return { id: configuredId, resolution: { kind: 'configured' }, tasks };
    }

    const projects = await this.provider.listProjects();

    if (projects.some((project) => project.id === configuredId)) {
      return { id: configuredId, resolution: { kind: 'configured' }, tasks };
    }

    return this.fallBackToDefault('replaced', projects);
  }

  private async fallBackToDefault(
    kind: 'defaulted' | 'replaced',
    known?: readonly ProviderProject[],
  ): Promise<ResolvedProject> {
    const project = defaultProjectOf(known ?? (await this.provider.listProjects()));

    return {
      id: project.id,
      resolution: { kind, project },
      tasks: await this.provider.listTasks(project.id),
    };
  }

  private async commit(edits: readonly LineEdit[]): Promise<void> {
    if (edits.length > 0) {
      await this.note.applyEdits(edits);
    }

    await this.saveLinks();
  }
}

interface SyncPass {
  readonly lines: readonly string[];
  readonly projectId: string;
  readonly remoteTasks: ReadonlyMap<string, ProviderTask>;
  readonly remoteTasksByBlockId: ReadonlyMap<string, ProviderTask>;
  readonly takenBlockIds: Set<string>;
  readonly localModifiedAt: number;
  readonly pendingBlockIds: Set<string>;
  readonly edits: LineEdit[];
  readonly outcome: SyncOutcome;
}

interface LineUnderSync {
  readonly pass: SyncPass;
  readonly lineNumber: number;
  readonly original: string;
  readonly task: ParsedTaskLine;
}

interface ResolvedProject {
  readonly id: string;
  readonly resolution: ProjectResolution;
  readonly tasks: readonly ProviderTask[];
}

function toTaskMap(tasks: readonly ProviderTask[]): Map<string, ProviderTask> {
  return new Map(tasks.map((task): [string, ProviderTask] => [task.id, task]));
}

function toBlockIdMap(tasks: readonly ProviderTask[]): Map<string, ProviderTask> {
  const found = new Map<string, ProviderTask>();

  for (const task of tasks) {
    if (task.embeddedBlockId !== undefined) {
      found.set(task.embeddedBlockId, task);
    }
  }

  return found;
}

function addEdit(line: LineUnderSync, replacement: string): void {
  if (replacement === line.original) {
    return;
  }

  line.pass.edits.push({ lineNumber: line.lineNumber, expected: line.original, replacement });
}
