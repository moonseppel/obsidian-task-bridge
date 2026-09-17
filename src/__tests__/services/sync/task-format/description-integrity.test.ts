import { NewTask, ProviderTask } from '../../../../services/task-provider';
import { TaskLinkStore } from '../../../../services/sync/sync-state/task-links';
import { LooseProviderTask, StubProviderOptions } from '../../../support/stub-provider';
import {
  FakeNote,
  PROJECT,
  bareBlockIdDescription,
  makeSync,
  projectExists,
  remoteTasks,
} from '../../../support/sync-harness';

/** The reported note: a description line two levels below its task, written as a tab plus four spaces. */
const TASK_LINE = '- [ ] another nesting testji';
const DESCRIPTION_LINE = '\t    - [ ] direct grandchild, now take a look at that #tag';
const NOTE = `${TASK_LINE}\n${DESCRIPTION_LINE}`;

const FOOTER_MARKER = 'TaskBridge ID: ^';

/**
 * Stands in for Todoist closely enough to reproduce the bug: it strips the whole description it is
 * given, declares that it does, and reads a task's block id off the footer the way the real one
 * does. A stub that stored descriptions verbatim would never see the failure at all.
 */
function trimmingProvider(
  ...seed: ProviderTask[]
): { readonly options: StubProviderOptions; readonly tasks: ProviderTask[] } {
  const tasks: ProviderTask[] = [...seed];

  const store = (task: NewTask): ProviderTask => ({
    id: `task-${tasks.length + 1}`,
    title: task.title,
    embeddedBlockId: footerBlockId(task.description ?? ''),
    isCompleted: false,
    projectId: task.projectId,
    description: (task.description ?? '').trim(),
    labels: task.labels ?? [],
  });

  return {
    tasks,
    options: {
      listProjects: projectExists,
      listTasks: () => Promise.resolve([...tasks]),
      createTask: (task) => {
        tasks.push(store(task));
        return Promise.resolve(tasks[tasks.length - 1]);
      },
      updateTaskDescription: (taskId, description) => {
        replace(tasks, taskId, { description: description.trim() });
        return Promise.resolve();
      },
      storedDescription: (description) => description.trim(),
    },
  };
}

function replace(tasks: ProviderTask[], taskId: string, changes: Partial<ProviderTask>): void {
  const index = tasks.findIndex((task) => task.id === taskId);

  tasks[index] = { ...tasks[index], ...changes };
}

function footerBlockId(description: string): string | undefined {
  const markerAt = description.lastIndexOf(FOOTER_MARKER);

  return markerAt === -1 ? undefined : description.slice(markerAt + FOOTER_MARKER.length).split('\n')[0];
}

describe('TaskSync against a provider that strips the description it stores', () => {
  it('leaves a description line two levels deep exactly where the user wrote it', async () => {
    const { note } = await syncTwice();

    expect(note.content.split('\n')[1]).toBe(DESCRIPTION_LINE);
  });

  it('keeps that line the task\'s description text rather than a task of its own', async () => {
    const { tasks } = await syncTwice();

    expect(tasks).toHaveLength(1);
  });

  /** The reindent alone is silent; it is the pass after it that acts on the rewritten note. */
  it('still creates no task for it once a later pass has read the note back', async () => {
    const { tasks } = await syncTwice(3);

    expect(tasks).toHaveLength(1);
  });
});

async function syncTwice(passes = 2): Promise<{ readonly note: FakeNote; readonly tasks: readonly ProviderTask[] }> {
  const note = new FakeNote(NOTE);
  const links = new TaskLinkStore();
  const provider = trimmingProvider();

  for (let pass = 0; pass < passes; pass += 1) {
    await makeSync(note, links, provider.options).run(PROJECT);
  }

  return { note, tasks: provider.tasks };
}

const ANCHORED_LINE = '- [ ] Buy milk ^tb-v1';
const NOTES_NOTE = `${ANCHORED_LINE}\n\tNotes`;

function linkedToNotes(): TaskLinkStore {
  return new TaskLinkStore([
    { blockId: 'tb-v1', providerTaskId: 'task-1', lastSyncedTitle: 'Buy milk', lastSyncedDescription: 'Notes' },
  ]);
}

function describedRemotely(userText: string): () => Promise<LooseProviderTask[]> {
  return remoteTasks({
    id: 'task-1',
    title: 'Buy milk',
    embeddedBlockId: 'tb-v1',
    description: bareBlockIdDescription('tb-v1', userText),
  });
}

describe('TaskSync comparing a description against what the provider would store', () => {
  it('pulls a leading-whitespace-only remote edit from a provider that declares no normalization', async () => {
    const note = new FakeNote(NOTES_NOTE);
    const sync = makeSync(note, linkedToNotes(), {
      listProjects: projectExists,
      listTasks: describedRemotely('   Notes'),
    });

    await sync.run(PROJECT);

    expect(note.content).toBe(`${ANCHORED_LINE}\n\t   Notes`);
  });

  it('leaves the same edit alone on a provider that strips what it stores, since it cannot have happened', async () => {
    const note = new FakeNote(NOTES_NOTE);
    const updateTaskDescription = jest.fn().mockResolvedValue(undefined);
    const sync = makeSync(note, linkedToNotes(), {
      listProjects: projectExists,
      listTasks: describedRemotely('   Notes'),
      updateTaskDescription,
      storedDescription: (description) => description.trim(),
    });

    await sync.run(PROJECT);

    expect(note.content).toBe(NOTES_NOTE);
    expect(updateTaskDescription).not.toHaveBeenCalled();
  });

  /** The footer sits below the user's text, so its trailing whitespace is mid-string and survives. */
  it('still pulls a trailing-whitespace-only remote edit from a provider that strips what it stores', async () => {
    const note = new FakeNote(NOTES_NOTE);
    const sync = makeSync(note, linkedToNotes(), {
      listProjects: projectExists,
      listTasks: describedRemotely('Notes   '),
      storedDescription: (description) => description.trim(),
    });

    await sync.run(PROJECT);

    expect(note.content).toBe(`${ANCHORED_LINE}\n\tNotes   `);
  });
});

const AFTER_FOOTER_DESCRIPTION = 'Notes\n\nTaskBridge ID: ^tb-v1\nAdded in Todoist';

function taskDescribedBelowItsFooter(): ProviderTask {
  return {
    id: 'task-1',
    title: 'Buy milk',
    embeddedBlockId: 'tb-v1',
    isCompleted: false,
    projectId: PROJECT,
    description: AFTER_FOOTER_DESCRIPTION,
    labels: [],
  };
}

function linkedWithoutDescription(): TaskLinkStore {
  return new TaskLinkStore([
    { blockId: 'tb-v1', providerTaskId: 'task-1', lastSyncedTitle: 'Buy milk', lastSyncedDescription: '' },
  ]);
}

describe('TaskSync against a description carrying text below the footer', () => {
  it('pulls that text into the note as part of the description, rather than ignoring it', async () => {
    const note = new FakeNote(ANCHORED_LINE);
    const provider = trimmingProvider(taskDescribedBelowItsFooter());

    await makeSync(note, linkedWithoutDescription(), provider.options).run(PROJECT);

    expect(note.content).toBe(`${ANCHORED_LINE}\n\tNotes\n\tAdded in Todoist`);
  });

  it('leaves it where it is for as long as neither side changes', async () => {
    const note = new FakeNote(ANCHORED_LINE);
    const links = linkedWithoutDescription();
    const provider = trimmingProvider(taskDescribedBelowItsFooter());

    await makeSync(note, links, provider.options).run(PROJECT);
    await makeSync(note, links, provider.options).run(PROJECT);

    expect(provider.tasks[0].description).toBe(AFTER_FOOTER_DESCRIPTION);
  });

  /** The next push moves it above the footer, which is a change of place and never a loss. */
  it('carries it along when a later local edit pushes the description back', async () => {
    const note = new FakeNote(ANCHORED_LINE);
    const links = linkedWithoutDescription();
    const provider = trimmingProvider(taskDescribedBelowItsFooter());

    await makeSync(note, links, provider.options).run(PROJECT);
    note.content = `${note.content}\n\tAnd one more`;
    await makeSync(note, links, provider.options).run(PROJECT);

    expect(provider.tasks[0].description).toBe(
      bareBlockIdDescription('tb-v1', 'Notes\nAdded in Todoist\nAnd one more'),
    );
  });
});
