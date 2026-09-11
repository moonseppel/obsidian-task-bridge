import { ProviderProject, ProviderTask, TaskProvider, defaultProjectOf } from '../task-provider';
import { createBlockId } from './block-id';
import { TaskLink, TaskLinkStore } from './task-links';
import { ParsedTaskLine, collectBlockIds, formatTaskLine, parseTaskLine } from './task-line';

/** Replaces one line only if it still reads as it did when the pass started. */
export interface LineEdit {
  readonly lineNumber: number;
  readonly expected: string;
  readonly replacement: string;
}

export interface SourceNote {
  read(): Promise<string>;
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

  constructor(
    note: SourceNote,
    provider: TaskProvider,
    links: TaskLinkStore,
    saveLinks: () => Promise<void>,
  ) {
    this.note = note;
    this.provider = provider;
    this.links = links;
    this.saveLinks = saveLinks;
  }

  async run(configuredProjectId: string): Promise<SyncOutcome> {
    const project = await this.resolveProject(configuredProjectId);
    const lines = (await this.note.read()).split('\n');
    const pass: SyncPass = {
      lines,
      projectId: project.id,
      remoteTitles: toTitleMap(project.tasks),
      takenBlockIds: collectBlockIds(lines),
      edits: [],
      outcome: { created: 0, pushed: 0, pulled: 0, conflicted: 0, projectResolution: project.resolution },
    };

    try {
      await this.syncEveryLine(pass);
    } finally {
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
      await this.createTask(line);
      return;
    }

    await this.syncAgainstLink(line, link);
  }

  /**
   * Both sides are checked against the title they last agreed on, rather than only ever asking
   * whether Obsidian changed, so a genuine conflict can be told apart from a one-sided change.
   */
  private async syncAgainstLink(line: LineUnderSync, link: TaskLink): Promise<void> {
    const remoteTitle = line.pass.remoteTitles.get(link.providerTaskId);
    const localChanged = line.task.title !== link.lastSyncedTitle;
    const remoteChanged =
      remoteTitle !== undefined && remoteTitle.length > 0 && remoteTitle !== link.lastSyncedTitle;

    if (localChanged && remoteChanged) {
      await this.resolveConflict(line, link, remoteTitle as string);
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

  /** Both sides landed on the same title independently: nothing to reconcile, so it's not a conflict. */
  private async resolveConflict(line: LineUnderSync, link: TaskLink, remoteTitle: string): Promise<void> {
    if (line.task.title === remoteTitle) {
      this.links.set({ ...link, lastSyncedTitle: remoteTitle });
      return;
    }

    line.pass.outcome.conflicted += 1;
    // Resolved via push for now; recency-based resolution follows in a later slice.
    await this.pushTitle(line, link);
  }

  private async createTask(line: LineUnderSync): Promise<void> {
    const { pass, task } = line;
    const created = await this.provider.createTask({ title: task.title, projectId: pass.projectId });
    // A block id already on the line but absent from the store is reused, never replaced,
    // so a note can never end up carrying two anchors for one task.
    const blockId = task.blockId ?? createBlockId(pass.takenBlockIds);

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
  readonly remoteTitles: ReadonlyMap<string, string>;
  readonly takenBlockIds: Set<string>;
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

function toTitleMap(tasks: readonly ProviderTask[]): Map<string, string> {
  return new Map(tasks.map((task): [string, string] => [task.id, task.title]));
}

function addEdit(line: LineUnderSync, replacement: string): void {
  if (replacement === line.original) {
    return;
  }

  line.pass.edits.push({ lineNumber: line.lineNumber, expected: line.original, replacement });
}
