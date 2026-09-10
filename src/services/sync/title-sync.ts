import { ProviderProject, ProviderTask, TaskProvider, defaultProjectOf } from '../task-provider';
import { createBlockId } from './block-id';
import { TaskLinkStore } from './task-links';
import { collectBlockIds, formatTaskLine, parseTaskLine } from './task-line';

/** Replaces one line only if it still reads as it did when the pass started. */
export interface LineEdit {
  readonly lineNumber: number;
  readonly expected: string;
  readonly replacement: string;
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

export interface SourceNote {
  read(): Promise<string>;
  applyEdits(edits: readonly LineEdit[]): Promise<void>;
}

export interface SyncOutcome {
  created: number;
  pushed: number;
  pulled: number;
  /** The project actually used, when it differs from the configured one, so it can be stored. */
  reassignedTo: ProviderProject | null;
  /** True when the configured project had vanished, rather than simply never having been set. */
  replacedMissingProject: boolean;
}

interface ResolvedProject {
  id: string;
  reassignedTo: ProviderProject | null;
  replacedMissingProject: boolean;
  /** The tasks already fetched while resolving, so they are not requested twice. */
  tasks: ProviderTask[] | null;
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
    const remoteTitles = toTitleMap(project.tasks ?? (await this.provider.listTasks(project.id)));
    const takenBlockIds = collectBlockIds(lines);
    const outcome: SyncOutcome = {
      created: 0,
      pushed: 0,
      pulled: 0,
      reassignedTo: project.reassignedTo,
      replacedMissingProject: project.replacedMissingProject,
    };
    const edits: LineEdit[] = [];

    try {
      for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
        await this.syncLine(
          { lines, lineNumber, projectId: project.id, remoteTitles, takenBlockIds, edits, outcome },
        );
      }
    } finally {
      // Whatever succeeded is committed even when a later call fails. A task created in the
      // provider without its link saved would be created a second time on the next pass.
      await this.commit(edits);
    }

    return outcome;
  }

  private async syncLine(pass: SyncPass): Promise<void> {
    const original = pass.lines[pass.lineNumber];
    const parsed = parseTaskLine(original);

    if (parsed === null || parsed.title.length === 0) {
      return;
    }

    const link = parsed.blockId === null ? undefined : this.links.get(parsed.blockId);

    if (link === undefined) {
      const created = await this.provider.createTask({ title: parsed.title, projectId: pass.projectId });
      // A block id already on the line but absent from the store is reused, never replaced,
      // so a note can never end up carrying two anchors for one task.
      const blockId = parsed.blockId ?? createBlockId(pass.takenBlockIds);

      pass.takenBlockIds.add(blockId);
      this.links.set({ blockId, providerTaskId: created.id, lastSyncedTitle: parsed.title });
      addEdit(pass, original, formatTaskLine({ ...parsed, blockId }));
      pass.outcome.created += 1;

      return;
    }

    if (parsed.title !== link.lastSyncedTitle) {
      await this.provider.updateTaskTitle(link.providerTaskId, parsed.title);
      this.links.set({ ...link, lastSyncedTitle: parsed.title });
      pass.outcome.pushed += 1;

      return;
    }

    const remoteTitle = pass.remoteTitles.get(link.providerTaskId);

    if (remoteTitle === undefined || remoteTitle.length === 0 || remoteTitle === link.lastSyncedTitle) {
      return;
    }

    this.links.set({ ...link, lastSyncedTitle: remoteTitle });
    addEdit(pass, original, formatTaskLine({ ...parsed, title: remoteTitle }));
    pass.outcome.pulled += 1;
  }

  /**
   * Syncing must never stall for want of a project, so an unset or vanished one falls back to the
   * provider's default. A project holding tasks plainly exists, which keeps the extra project
   * lookup to the only ambiguous case: an empty answer.
   */
  private async resolveProject(configuredId: string): Promise<ResolvedProject> {
    if (configuredId.length === 0) {
      return this.fallBackToDefault(await this.provider.listProjects(), false);
    }

    const tasks = await this.provider.listTasks(configuredId);

    if (tasks.length > 0) {
      return { id: configuredId, reassignedTo: null, replacedMissingProject: false, tasks };
    }

    const projects = await this.provider.listProjects();

    if (projects.some((project) => project.id === configuredId)) {
      return { id: configuredId, reassignedTo: null, replacedMissingProject: false, tasks };
    }

    return this.fallBackToDefault(projects, true);
  }

  private fallBackToDefault(
    projects: readonly ProviderProject[],
    replacedMissingProject: boolean,
  ): ResolvedProject {
    const fallback = defaultProjectOf(projects);

    return { id: fallback.id, reassignedTo: fallback, replacedMissingProject, tasks: null };
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
  readonly lineNumber: number;
  readonly projectId: string;
  readonly remoteTitles: ReadonlyMap<string, string>;
  readonly takenBlockIds: Set<string>;
  readonly edits: LineEdit[];
  readonly outcome: SyncOutcome;
}

function toTitleMap(tasks: readonly ProviderTask[]): Map<string, string> {
  return new Map(tasks.map((task): [string, string] => [task.id, task.title]));
}

function addEdit(pass: SyncPass, expected: string, replacement: string): void {
  if (replacement === expected) {
    return;
  }

  pass.edits.push({ lineNumber: pass.lineNumber, expected, replacement });
}
