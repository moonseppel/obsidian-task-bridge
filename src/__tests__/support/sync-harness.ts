import { NoteEdits, applyNoteEdits } from '../../services/sync/note-edits';
import { OrphanTracker } from '../../services/sync/orphan-tracker';
import { SourceNote } from '../../services/sync/source-note';
import { composeRemoteDescription } from '../../services/sync/task-description';
import { TaskLinkStore } from '../../services/sync/task-links';
import { TaskSync } from '../../services/sync/task-sync';
import { LooseProviderTask, stubProvider } from './stub-provider';

export const PROJECT = 'project-1';
export const TASK_ID = '6X4Vw2Hfmg73Q2XR';

export const INBOX = { id: 'inbox-1', name: 'Inbox', isDefault: true };
export const ERRANDS = { id: PROJECT, name: 'Errands', isDefault: false };
export const projectExists = (): Promise<typeof INBOX[]> => Promise.resolve([INBOX, ERRANDS]);

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

  async applyEdits(edits: NoteEdits): Promise<void> {
    this.saves += 1;
    this.content = applyNoteEdits(this.content, edits);
  }
}

export function makeSync(
  note: FakeNote,
  links: TaskLinkStore,
  provider: Parameters<typeof stubProvider>[0],
  onSave: () => void = () => undefined,
  getDeviceTag?: () => string,
  orphans?: OrphanTracker,
): TaskSync {
  return new TaskSync({
    note,
    provider: stubProvider(provider),
    links,
    saveLinks: async () => {
      onSave();
    },
    getDeviceTag,
    orphans,
  });
}

export function remoteTasks(...tasks: LooseProviderTask[]): () => Promise<LooseProviderTask[]> {
  return () => Promise.resolve(tasks);
}
