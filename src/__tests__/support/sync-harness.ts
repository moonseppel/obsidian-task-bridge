import { NoteEdits, applyNoteEdits, countSkippedEdits } from '../../services/sync/note-edits';
import { OrphanTracker } from '../../services/sync/orphan-tracker';
import { SourceNote } from '../../services/sync/source-note';
import { composeRemoteDescription } from '../../services/sync/task-description';
import { ParsedTaskLine } from '../../services/sync/task-line';
import { TaskLinkStore } from '../../services/sync/task-links';
import { TaskSync, TaskSyncDependencies } from '../../services/sync/task-sync';
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

  async applyEdits(edits: NoteEdits): Promise<number> {
    const skipped = countSkippedEdits(this.content, edits);

    this.saves += 1;
    this.content = applyNoteEdits(this.content, edits);

    return skipped;
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
    filesInScope: () => [...notesByPath.keys()],
    noteFor: (path) => registeredNote(notesByPath, path),
    provider: stubProvider(provider),
    links,
  });
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
  };
}

function registeredNote(notesByPath: ReadonlyMap<string, FakeNote>, path: string): FakeNote {
  const note = notesByPath.get(path);

  if (note === undefined) {
    throw new Error(`No fake note registered for path "${path}".`);
  }

  return note;
}
