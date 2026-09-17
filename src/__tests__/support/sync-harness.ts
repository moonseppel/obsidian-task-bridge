import { appendAnchorToLine } from '../../services/sync/note-access/anchor-write';
import { Indentation } from '../../services/sync/task-format/indentation';
import { NoteEdits, applyNoteEdits, countSkippedEdits } from '../../services/sync/note-access/note-edits';
import { OrphanTracker } from '../../services/sync/orphans/orphan-tracker';
import { SourceNote } from '../../services/sync/note-access/source-note';
import { composeRemoteDescription } from '../../services/sync/task-format/task-footer';
import { ParsedTaskLine, parseTaskLine } from '../../services/sync/task-format/task-line';
import { TaskLinkStore } from '../../services/sync/sync-state/task-links';
import { TaskSync, TaskSyncDependencies } from '../../services/sync/sync-pass/task-sync';
import { LooseProviderTask, StubProviderOptions, stubProvider } from './stub-provider';

export const PROJECT = 'project-1';
export const TASK_ID = '6X4Vw2Hfmg73Q2XR';

export const INBOX = { id: 'inbox-1', name: 'Inbox', isDefault: true };
export const ERRANDS = { id: PROJECT, name: 'Errands', isDefault: false };
export const projectExists = (): Promise<typeof INBOX[]> => Promise.resolve([INBOX, ERRANDS]);

export const SOLE_PATH = 'Tasks.md';

/** What a scenario may wire in beyond its note, links and provider; everything left out keeps its default. */
export interface SyncHarnessOptions {
  readonly onSave?: () => void;
  readonly getDeviceTag?: () => string;
  readonly orphans?: OrphanTracker;
  readonly isTagInScope?: (task: ParsedTaskLine) => boolean;
  readonly existsOutsideIgnoredFiles?: (blockId: string) => boolean;
  readonly locateParentFile?: (blockId: string) => string | undefined;
  readonly readTabSize?: () => unknown;
}

/** The description a freshly created task carries: the user's text above this plugin's footer. */
export function bareBlockIdDescription(blockId: string, userText = ''): string {
  return composeRemoteDescription(userText, blockId);
}

export class FakeNote implements SourceNote {
  content: string;
  saves = 0;
  modifiedAt = 0;

  constructor(content: string) {
    this.content = content;
  }

  async read(): Promise<string> {
    return this.content;
  }

  async lastModified(): Promise<number> {
    return this.modifiedAt;
  }

  async applyEdits(edits: NoteEdits, indentation: Indentation): Promise<number> {
    const skipped = countSkippedEdits(this.content, edits);

    this.saves += 1;
    this.content = applyNoteEdits(this.content, edits, indentation);

    return skipped;
  }

  async appendAnchorIfMissing(lineNumber: number, blockId: string, indentation: Indentation): Promise<boolean> {
    const result = appendAnchorToLine(this.content, lineNumber, blockId, indentation);

    this.saves += 1;
    this.content = result.content;

    return result.appended;
  }
}

export function makeSync(
  note: FakeNote,
  links: TaskLinkStore,
  provider: StubProviderOptions,
  options: SyncHarnessOptions = {},
): TaskSync {
  return new TaskSync({
    ...optionalDependencies(options),
    filesInScope: () => [SOLE_PATH],
    noteFor: () => note,
    provider: stubProvider(provider),
    links,
  });
}

/** For a scenario spanning more than one file, each mapped to its own `FakeNote`. */
export function makeMultiFileSync(
  notesByPath: ReadonlyMap<string, FakeNote>,
  links: TaskLinkStore,
  provider: StubProviderOptions,
  options: SyncHarnessOptions = {},
): TaskSync {
  return new TaskSync({
    ...optionalDependencies(options),
    locateParentFile: options.locateParentFile ?? defaultLocateParentFile(notesByPath),
    filesInScope: () => [...notesByPath.keys()],
    noteFor: (path) => registeredNote(notesByPath, path),
    provider: stubProvider(provider),
    links,
  });
}

/** Mirrors `TaskCollection.locateParentFile`: which registered note currently anchors a block id. */
function defaultLocateParentFile(notesByPath: ReadonlyMap<string, FakeNote>): (blockId: string) => string | undefined {
  return (blockId) => {
    for (const [path, note] of notesByPath) {
      if (note.content.split('\n').some((line) => parseTaskLine(line)?.blockId === blockId)) {
        return path;
      }
    }

    return undefined;
  };
}

export function remoteTasks(...tasks: LooseProviderTask[]): () => Promise<LooseProviderTask[]> {
  return () => Promise.resolve(tasks);
}

function optionalDependencies(
  options: SyncHarnessOptions,
): Omit<TaskSyncDependencies, 'filesInScope' | 'noteFor' | 'provider' | 'links'> {
  return {
    saveLinks: async () => {
      options.onSave?.();
    },
    getDeviceTag: options.getDeviceTag,
    orphans: options.orphans,
    isTagInScope: options.isTagInScope,
    existsOutsideIgnoredFiles: options.existsOutsideIgnoredFiles,
    locateParentFile: options.locateParentFile,
    readTabSize: options.readTabSize,
  };
}

function registeredNote(notesByPath: ReadonlyMap<string, FakeNote>, path: string): FakeNote {
  const note = notesByPath.get(path);

  if (note === undefined) {
    throw new Error(`No fake note registered for path "${path}".`);
  }

  return note;
}
