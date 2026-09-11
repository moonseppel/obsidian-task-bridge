import { ProviderProject, ProviderTask, TaskProvider, defaultProjectOf } from '../task-provider';
import { createBlockId } from './block-id';
import { OrphanTracker } from './orphan-tracker';
import { bareBlockIdDescription, orphanNoticeDescription, stripOrphanNotice } from './orphan-notice';
import {
  DescriptionBlock,
  extractUserDescription,
  leadingWhitespace,
  readDescriptionBlock,
  renderDescriptionBlock,
} from './task-description';
import { TaskLink, TaskLinkStore } from './task-links';
import { ParsedTaskLine, collectBlockIds, formatTaskLine, isDone, parseTaskLine } from './task-line';

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
/** A resurrected line's original marker (bullet vs. numbered, checked vs. not) no longer exists to restore. */
const RESURRECTED_LINE_PREFIX = '- ';
const RESURRECTED_LINE_CHECKBOX = ' ';

/** Replaces one line only if it still reads as it did when the pass started. */
export interface LineEdit {
  readonly lineNumber: number;
  readonly expected: string;
  readonly replacement: string;
}

/** Drops one line outright, only if it still reads as it did when the pass started. */
export interface LineRemoval {
  readonly lineNumber: number;
  readonly expected: string;
}

/**
 * Inserts or replaces a multi-line block immediately under a task line, guarded by that line's own
 * content rather than the block's — the block may not exist yet (lineCount 0), and it is the task
 * line that identifies where it belongs. startLine/lineCount describe the block's current span
 * (both 0 when there is none yet), in the original line numbers the pass started with.
 */
export interface BlockEdit {
  readonly taskLineNumber: number;
  readonly expectedTaskLine: string;
  readonly startLine: number;
  readonly lineCount: number;
  readonly replacementLines: readonly string[];
}

/** Everything one pass wants done to the note, applied together in the same atomic write. */
export interface NoteEdits {
  readonly replacements: readonly LineEdit[];
  readonly removals: readonly LineRemoval[];
  readonly blocks: readonly BlockEdit[];
  readonly appended: readonly string[];
}

export interface SourceNote {
  read(): Promise<string>;
  /** Epoch ms the note was last modified, so a conflict can be resolved by recency. */
  lastModified(): Promise<number>;
  applyEdits(edits: NoteEdits): Promise<void>;
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
  /** A note line removed because its linked task was deleted in the provider. */
  removedLine: number;
  /** A provider task removed because its linked line was deleted from the note. */
  removedTask: number;
  /** A task recreated because it was deleted remotely while its line carried a newer local edit. */
  recreatedTask: number;
  /** A line re-appended because its task carried a newer remote edit after the line was deleted. */
  resurrectedLine: number;
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

/** Drops only the lines that still read as they did, the same safety net replacements get. */
export function removeLines(content: string, removals: readonly LineRemoval[]): string {
  const lines = content.split('\n');
  const toRemove = new Set(
    removals
      .filter((removal) => lines[removal.lineNumber] === removal.expected)
      .map((removal) => removal.lineNumber),
  );

  return lines.filter((_line, index) => !toRemove.has(index)).join('\n');
}

/** Appends whole new lines at the end of the note, e.g. to resurrect a line a conflict decided to keep. */
export function appendLines(content: string, lines: readonly string[]): string {
  if (lines.length === 0) {
    return content;
  }

  return content.length === 0 ? lines.join('\n') : [content, ...lines].join('\n');
}

/** Composes today's replacements, removals and blocks with appends, applied together in one atomic write. */
export function applyNoteEdits(content: string, edits: NoteEdits): string {
  return appendLines(applyStructuralEdits(content, edits), edits.appended);
}

/**
 * Replacements, removals and block insertions are all resolved against the same original line
 * numbers in a single pass, rather than composed sequentially, since a block growing or shrinking
 * the note would otherwise shift every later edit's target out from under it.
 */
function applyStructuralEdits(
  content: string,
  edits: Pick<NoteEdits, 'replacements' | 'removals' | 'blocks'>,
): string {
  const lines = content.split('\n');
  const replacementByLine = new Map(edits.replacements.map((edit): [number, LineEdit] => [edit.lineNumber, edit]));
  const removedLines = new Set(
    edits.removals
      .filter((removal) => lines[removal.lineNumber] === removal.expected)
      .map((removal) => removal.lineNumber),
  );
  const activeBlocks = edits.blocks.filter((block) => lines[block.taskLineNumber] === block.expectedTaskLine);
  const blockByAnchor = new Map(activeBlocks.map((block): [number, BlockEdit] => [block.taskLineNumber, block]));
  const skippedBlockLines = new Set(
    activeBlocks.flatMap((block) => Array.from({ length: block.lineCount }, (_, i) => block.startLine + i)),
  );

  const result: string[] = [];

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    if (removedLines.has(lineNumber) || skippedBlockLines.has(lineNumber)) {
      continue;
    }

    const replacement = replacementByLine.get(lineNumber);
    result.push(replacement === undefined ? lines[lineNumber] : replacement.replacement);

    const block = blockByAnchor.get(lineNumber);
    if (block !== undefined) {
      result.push(...block.replacementLines);
    }
  }

  return result.join('\n');
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
  /** The same debounce, in the other direction: a linked block id must stay missing from the note
   * for this long, across passes, before its task is treated as genuinely deleted locally. */
  private readonly firstSeenMissingFromNote = new Map<string, number>();

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
      replacements: [],
      removals: [],
      blocks: [],
      appended: [],
      outcome: {
        created: 0,
        pushed: 0,
        pulled: 0,
        conflicted: 0,
        removedLine: 0,
        removedTask: 0,
        recreatedTask: 0,
        resurrectedLine: 0,
        projectResolution: project.resolution,
      },
    };

    try {
      await this.syncEveryLine(pass);
      await this.syncMissingLinks(pass);
    } finally {
      this.forgetBlockIdsNotSeen(pass.pendingBlockIds);
      // Whatever succeeded is committed even when a later call fails. A task created in the
      // provider without its link saved would be created a second time on the next pass.
      await this.commit(pass);
      // Runs after the pass's own work is safely committed, so a transient failure here
      // (flagging or removing an orphan) never blocks what already succeeded from being saved.
      await this.updateOrphanTracking(pass.remoteTasks.values());
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
   * A stored link whose block id no longer appears anywhere in the note is a candidate for a
   * locally deleted line — checked against every link, not just lines the note still has, since
   * this is exactly the case where the note no longer has one. Past the grace period, each is
   * resolved against the project's already-fetched task list.
   */
  private async syncMissingLinks(pass: SyncPass): Promise<void> {
    const stillMissing = new Set<string>();

    for (const link of [...this.links.values()]) {
      if (pass.takenBlockIds.has(link.blockId)) {
        this.firstSeenMissingFromNote.delete(link.blockId);
        continue;
      }

      stillMissing.add(link.blockId);

      if (this.stillWithinMissingGracePeriod(link.blockId)) {
        continue;
      }

      await this.syncAgainstMissingLine(pass, link);
    }

    for (const blockId of this.firstSeenMissingFromNote.keys()) {
      if (!stillMissing.has(blockId)) {
        this.firstSeenMissingFromNote.delete(blockId);
      }
    }
  }

  private stillWithinMissingGracePeriod(blockId: string): boolean {
    const firstSeenAt = this.firstSeenMissingFromNote.get(blockId);

    if (firstSeenAt === undefined) {
      this.firstSeenMissingFromNote.set(blockId, Date.now());
      return true;
    }

    return Date.now() - firstSeenAt < CREATION_GRACE_PERIOD_MS;
  }

  /**
   * The task itself is still checked against the already-fetched list rather than assumed gone:
   * the line vanishing from the note says nothing about whether the task also did.
   */
  private async syncAgainstMissingLine(pass: SyncPass, link: TaskLink): Promise<void> {
    const remoteTask = pass.remoteTasks.get(link.providerTaskId);

    if (remoteTask === undefined) {
      await this.resolveMissingLineAgainstAbsentTask(pass, link);
      return;
    }

    const remoteChanged = remoteTask.title.length > 0 && remoteTask.title !== link.lastSyncedTitle;

    if (remoteChanged) {
      await this.resolveMissingLineConflict(pass, link, remoteTask);
      return;
    }

    await this.provider.removeTask(link.providerTaskId);
    this.links.delete(link.blockId);
    pass.outcome.removedTask += 1;
  }

  /**
   * A task missing from the active list is ambiguous between deleted, moved, and completed, same
   * as when the line still names it. Not found confirms deletion — there was nothing left to
   * remove. Found in a different project is left exactly as it was: the line is already gone, but
   * nothing else changes while the task stays out of this project. Found completed here finishes
   * the same tidy-up a deleted task already gets, since the line is gone either way.
   */
  private async resolveMissingLineAgainstAbsentTask(pass: SyncPass, link: TaskLink): Promise<void> {
    const found = await this.provider.getTask(link.providerTaskId);

    if (found === undefined) {
      this.links.delete(link.blockId);
      return;
    }

    if (found.projectId !== pass.projectId || !found.isCompleted) {
      return;
    }

    await this.provider.removeTask(link.providerTaskId);
    this.links.delete(link.blockId);
    pass.outcome.removedTask += 1;
  }

  /**
   * The note's overall last-modified time stands in for "when the line was deleted" — removing a
   * line touches the file's mtime the same as any other edit — compared against the task's
   * `updated_at` by the same recency rule a plain title conflict already uses. The remote edit
   * winning resurrects the line, appended at the end of the note since its old position no longer
   * exists to restore it to.
   */
  private async resolveMissingLineConflict(
    pass: SyncPass,
    link: TaskLink,
    remoteTask: ProviderTask,
  ): Promise<void> {
    pass.outcome.conflicted += 1;

    if (remoteTask.updatedAt !== undefined && remoteTask.updatedAt > pass.localModifiedAt) {
      pass.appended.push(
        formatTaskLine({
          prefix: RESURRECTED_LINE_PREFIX,
          checkbox: RESURRECTED_LINE_CHECKBOX,
          title: remoteTask.title,
          tags: [],
          blockId: link.blockId,
        }),
      );
      this.links.set({ ...link, lastSyncedTitle: remoteTask.title });
      pass.outcome.resurrectedLine += 1;
      return;
    }

    await this.provider.removeTask(link.providerTaskId);
    this.links.delete(link.blockId);
    pass.outcome.removedTask += 1;
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

      const blockId = task.embeddedBlockId;
      const link = this.links.get(blockId);

      if (link !== undefined && link.providerTaskId === task.id) {
        await this.unflagIfFlagged(task.id, blockId, task.description);
        continue;
      }

      this.orphans.track(task.id, now);

      if (await this.removeIfDue(task.id, now)) {
        // Excluded from stillOrphaned rather than tracked: it is gone, not merely orphaned.
        continue;
      }

      stillOrphaned.add(task.id);
      await this.flagIfDue(task.id, blockId, task.description, now);
    }

    this.orphans.keepOnly(stillOrphaned);
  }

  /**
   * A task orphaned for less than the flag delay is left alone: a re-link lookup a pass or two
   * later resolves most of these on its own, so nothing is flagged before that grace has passed.
   */
  private async flagIfDue(providerTaskId: string, blockId: string, description: string, now: number): Promise<void> {
    const record = this.orphans.get(providerTaskId);

    if (record === undefined || record.removalDueAt !== undefined) {
      return;
    }

    if (now - record.firstSeenOrphanedAt < ORPHAN_FLAG_AFTER_MS) {
      return;
    }

    const removalDueAt = now + ORPHAN_REMOVAL_GRACE_MS;
    const notice = orphanNoticeDescription(blockId, removalDueAt, extractUserDescription(description));
    await this.provider.updateTaskDescription(providerTaskId, notice);
    this.orphans.flag(providerTaskId, removalDueAt);
  }

  /** Returns true once the task's recorded removal date has passed and it has been removed. */
  private async removeIfDue(providerTaskId: string, now: number): Promise<boolean> {
    const record = this.orphans.get(providerTaskId);

    if (record?.removalDueAt === undefined || now < record.removalDueAt) {
      return false;
    }

    await this.provider.removeTask(providerTaskId);

    return true;
  }

  /**
   * A task the note re-links (e.g. Slice 7's lookup finding it again) is no longer orphaned, so a
   * stale "will be removed on X" notice is reverted rather than left threatening a task nobody
   * meant to remove. The removal date itself was never derived from this text — only the tracking
   * this reverses decided it — so reverting the notice changes nothing about what was decided.
   */
  private async unflagIfFlagged(providerTaskId: string, blockId: string, description: string): Promise<void> {
    const record = this.orphans.get(providerTaskId);

    if (record?.removalDueAt === undefined) {
      return;
    }

    const userText = stripOrphanNotice(extractUserDescription(description));
    await this.provider.updateTaskDescription(providerTaskId, bareBlockIdDescription(blockId, userText));
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
   * Every synced field is checked independently against what both sides last agreed on for that
   * field specifically, rather than only ever asking whether Obsidian changed, so a genuine
   * conflict on one field can be told apart from a one-sided change and from an unrelated change
   * on another field entirely.
   */
  private async syncAgainstLink(line: LineUnderSync, link: TaskLink): Promise<void> {
    const remoteTask = line.pass.remoteTasks.get(link.providerTaskId);

    if (remoteTask === undefined) {
      await this.syncAgainstMissingRemoteTask(line, link);
      return;
    }

    await this.syncTitleAgainstLink(line, link, remoteTask);
    // Re-fetched rather than reusing the snapshot above, and again below: an earlier field's sync
    // may have just updated the stored link, and the next one must merge onto that, not silently
    // revert it.
    await this.syncDoneAgainstLink(line, this.currentLink(link), remoteTask);
    await this.syncDescriptionAgainstLink(line, this.currentLink(link), remoteTask);
    await this.syncTagsAgainstLink(line, this.currentLink(link), remoteTask);
  }

  private currentLink(link: TaskLink): TaskLink {
    return this.links.get(link.blockId) ?? link;
  }

  private async syncTitleAgainstLink(line: LineUnderSync, link: TaskLink, remoteTask: ProviderTask): Promise<void> {
    const remoteTitle = remoteTask.title;
    const localChanged = line.task.title !== link.lastSyncedTitle;
    const remoteChanged = remoteTitle.length > 0 && remoteTitle !== link.lastSyncedTitle;

    if (localChanged && remoteChanged) {
      await this.resolveFieldConflict(
        line,
        remoteTask.updatedAt,
        line.task.title === remoteTitle,
        () => this.links.set({ ...link, lastSyncedTitle: remoteTitle }),
        () => this.pushTitle(line, link),
        () => this.pullTitle(line, link, remoteTitle),
      );
      return;
    }

    if (localChanged) {
      await this.pushTitle(line, link);
      return;
    }

    if (remoteChanged) {
      this.pullTitle(line, link, remoteTitle);
    }
  }

  /**
   * A task's mere presence in the active list this pass fetched means it is not completed, by
   * construction (Todoist's active list excludes a completed task exactly as it excludes a deleted
   * one) — so the remote side of this comparison is always "not done" here. A remote completion
   * that instead made the task disappear from the list is handled separately, by
   * syncAgainstCompletedTask, called from syncAgainstMissingRemoteTask.
   */
  private async syncDoneAgainstLink(line: LineUnderSync, link: TaskLink, remoteTask: ProviderTask): Promise<void> {
    await this.resolveDoneAgainstKnownRemote(line, link, false, remoteTask.updatedAt);
  }

  /**
   * The three-way state comparison both callers share: the remote side is passed in as a known
   * constant, since by the time either caller runs, whether the task is currently done is already
   * settled by other means (its presence in the active list, or a direct lookup) rather than
   * itself in question here.
   */
  private async resolveDoneAgainstKnownRemote(
    line: LineUnderSync,
    link: TaskLink,
    remoteDone: boolean,
    remoteUpdatedAt: number | undefined,
  ): Promise<void> {
    const lastSyncedDone = link.lastSyncedDone ?? false;
    const localDone = isDone(line.task);
    const localChanged = localDone !== lastSyncedDone;
    const remoteChanged = remoteDone !== lastSyncedDone;

    if (localChanged && remoteChanged) {
      await this.resolveFieldConflict(
        line,
        remoteUpdatedAt,
        localDone === remoteDone,
        () => this.links.set({ ...link, lastSyncedDone: remoteDone }),
        () => this.pushDone(line, link, localDone),
        () => this.pullDone(line, link, remoteDone),
      );
      return;
    }

    if (localChanged) {
      await this.pushDone(line, link, localDone);
      return;
    }

    if (remoteChanged) {
      this.pullDone(line, link, remoteDone);
    }
  }

  private async syncDescriptionAgainstLink(line: LineUnderSync, link: TaskLink, remoteTask: ProviderTask): Promise<void> {
    const localBlock = readDescriptionBlock(line.pass.lines, line.lineNumber);
    const localText = localBlock.text;
    const remoteText = extractUserDescription(remoteTask.description);
    const lastSyncedDescription = link.lastSyncedDescription ?? '';
    const localChanged = localText !== lastSyncedDescription;
    const remoteChanged = remoteText !== lastSyncedDescription;

    if (localChanged && remoteChanged) {
      await this.resolveFieldConflict(
        line,
        remoteTask.updatedAt,
        localText === remoteText,
        () => this.links.set({ ...link, lastSyncedDescription: remoteText }),
        () => this.pushDescription(line, link, localText),
        () => this.pullDescription(line, link, localBlock, remoteText),
      );
      return;
    }

    if (localChanged) {
      await this.pushDescription(line, link, localText);
      return;
    }

    if (remoteChanged) {
      this.pullDescription(line, link, localBlock, remoteText);
    }
  }

  /** Order never counts as a change: tags and labels are compared, and stored, as sets. */
  private async syncTagsAgainstLink(line: LineUnderSync, link: TaskLink, remoteTask: ProviderTask): Promise<void> {
    const localTags = line.task.tags;
    const remoteTags = remoteTask.labels;
    const lastSyncedTags = link.lastSyncedTags ?? [];
    const localChanged = !sameTagSet(localTags, lastSyncedTags);
    const remoteChanged = !sameTagSet(remoteTags, lastSyncedTags);

    if (localChanged && remoteChanged) {
      await this.resolveFieldConflict(
        line,
        remoteTask.updatedAt,
        sameTagSet(localTags, remoteTags),
        () => this.links.set({ ...link, lastSyncedTags: canonicalTags(remoteTags) }),
        () => this.pushTags(line, link, localTags),
        () => this.pullTags(line, link, remoteTags),
      );
      return;
    }

    if (localChanged) {
      await this.pushTags(line, link, localTags);
      return;
    }

    if (remoteChanged) {
      this.pullTags(line, link, remoteTags);
    }
  }

  /**
   * A linked task missing from the project's fetched list is ambiguous between deleted, moved to a
   * different project, and completed — Todoist's active list excludes a completed task exactly as
   * it excludes a deleted one — so it is looked up directly before anything destructive happens.
   * Found and completed, still in this project, is not a deletion at all: the completion is synced
   * instead. Found in a different project means the user moved it out of this plugin's care, so
   * neither the task nor the line is touched and the link is left as it was. Only when it isn't
   * found at all is it treated as genuinely deleted.
   */
  private async syncAgainstMissingRemoteTask(line: LineUnderSync, link: TaskLink): Promise<void> {
    const found = await this.provider.getTask(link.providerTaskId);

    if (found !== undefined) {
      if (found.projectId === line.pass.projectId && found.isCompleted) {
        await this.resolveDoneAgainstKnownRemote(line, link, true, found.updatedAt);
      }
      return;
    }

    const localChanged = line.task.title !== link.lastSyncedTitle;

    if (localChanged) {
      await this.recreateTask(line, link);
      return;
    }

    addRemoval(line);
    this.links.delete(link.blockId);
    line.pass.outcome.removedLine += 1;
  }

  /**
   * The remote side has no timestamp to compare once its task is gone, so per the same
   * missing-timestamp rule a plain title conflict already follows, the local edit wins: a fresh
   * task is created from the line's current title and re-linked, rather than the edit being lost
   * to the line simply being removed.
   */
  private async recreateTask(line: LineUnderSync, link: TaskLink): Promise<void> {
    const descriptionText = readDescriptionBlock(line.pass.lines, line.lineNumber).text;
    const created = await this.provider.createTask({
      title: line.task.title,
      projectId: line.pass.projectId,
      description: bareBlockIdDescription(link.blockId, descriptionText),
      labels: line.task.tags,
    });

    this.links.set({
      blockId: link.blockId,
      providerTaskId: created.id,
      lastSyncedTitle: line.task.title,
      lastSyncedDescription: descriptionText,
      lastSyncedTags: canonicalTags(line.task.tags),
    });
    line.pass.outcome.conflicted += 1;
    line.pass.outcome.recreatedTask += 1;
  }

  /**
   * The shape every synced field's conflict follows: both sides landing on the same value
   * independently is not a conflict, just a silent settle. Otherwise the newer side wins; when
   * recency can't be told (the remote timestamp is missing, or the two are exactly equal) the
   * local edit wins, deterministically, so the outcome never flaps from one pass to the next.
   */
  private async resolveFieldConflict(
    line: LineUnderSync,
    remoteUpdatedAt: number | undefined,
    valuesAgree: boolean,
    settle: () => void,
    push: () => Promise<void>,
    pull: () => void,
  ): Promise<void> {
    if (valuesAgree) {
      settle();
      return;
    }

    line.pass.outcome.conflicted += 1;

    if (remoteUpdatedAt !== undefined && remoteUpdatedAt > line.pass.localModifiedAt) {
      pull();
      return;
    }

    await push();
  }

  private async createTask(line: LineUnderSync): Promise<void> {
    const { pass, task } = line;
    // A block id already on the line but absent from the store is reused, never replaced,
    // so a note can never end up carrying two anchors for one task.
    const blockId = task.blockId ?? createBlockId(pass.takenBlockIds, undefined, this.getDeviceTag());
    const descriptionText = readDescriptionBlock(pass.lines, line.lineNumber).text;
    const created = await this.provider.createTask({
      title: task.title,
      projectId: pass.projectId,
      description: bareBlockIdDescription(blockId, descriptionText),
      labels: task.tags,
    });

    pass.takenBlockIds.add(blockId);
    this.links.set({
      blockId,
      providerTaskId: created.id,
      lastSyncedTitle: task.title,
      lastSyncedDescription: descriptionText,
      lastSyncedTags: canonicalTags(task.tags),
    });
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

  private async pushDone(line: LineUnderSync, link: TaskLink, done: boolean): Promise<void> {
    await (done ? this.provider.completeTask(link.providerTaskId) : this.provider.reopenTask(link.providerTaskId));
    this.links.set({ ...link, lastSyncedDone: done });
    line.pass.outcome.pushed += 1;
  }

  private pullDone(line: LineUnderSync, link: TaskLink, done: boolean): void {
    this.links.set({ ...link, lastSyncedDone: done });
    addEdit(line, formatTaskLine({ ...line.task, checkbox: done ? 'x' : ' ' }));
    line.pass.outcome.pulled += 1;
  }

  private async pushDescription(line: LineUnderSync, link: TaskLink, text: string): Promise<void> {
    await this.provider.updateTaskDescription(link.providerTaskId, bareBlockIdDescription(link.blockId, text));
    this.links.set({ ...link, lastSyncedDescription: text });
    line.pass.outcome.pushed += 1;
  }

  private pullDescription(line: LineUnderSync, link: TaskLink, currentBlock: DescriptionBlock, text: string): void {
    this.links.set({ ...link, lastSyncedDescription: text });
    line.pass.blocks.push({
      taskLineNumber: line.lineNumber,
      expectedTaskLine: line.original,
      startLine: currentBlock.startLine,
      lineCount: currentBlock.lineCount,
      replacementLines: renderDescriptionBlock(leadingWhitespace(line.original), text),
    });
    line.pass.outcome.pulled += 1;
  }

  private async pushTags(line: LineUnderSync, link: TaskLink, tags: readonly string[]): Promise<void> {
    await this.provider.updateTaskLabels(link.providerTaskId, tags);
    this.links.set({ ...link, lastSyncedTags: canonicalTags(tags) });
    line.pass.outcome.pushed += 1;
  }

  private pullTags(line: LineUnderSync, link: TaskLink, tags: readonly string[]): void {
    this.links.set({ ...link, lastSyncedTags: canonicalTags(tags) });
    addEdit(line, formatTaskLine({ ...line.task, tags: [...tags] }));
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

  private async commit(pass: SyncPass): Promise<void> {
    const edits: NoteEdits = {
      replacements: pass.replacements,
      removals: pass.removals,
      blocks: pass.blocks,
      appended: pass.appended,
    };

    if (edits.replacements.length + edits.removals.length + edits.blocks.length + edits.appended.length > 0) {
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
  readonly replacements: LineEdit[];
  readonly removals: LineRemoval[];
  readonly blocks: BlockEdit[];
  readonly appended: string[];
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

  line.pass.replacements.push({ lineNumber: line.lineNumber, expected: line.original, replacement });
}

function addRemoval(line: LineUnderSync): void {
  line.pass.removals.push({ lineNumber: line.lineNumber, expected: line.original });
}

/** A stable, sorted form to store as lastSyncedTags, so later comparisons never depend on order. */
function canonicalTags(tags: readonly string[]): string[] {
  return [...tags].sort();
}

function sameTagSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = canonicalTags(a);
  const sortedB = canonicalTags(b);

  return sortedA.every((tag, index) => tag === sortedB[index]);
}
