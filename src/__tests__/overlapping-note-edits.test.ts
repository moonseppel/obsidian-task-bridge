import { TaskLinkStore } from '../services/sync/task-links';
import { LooseProviderTask } from './support/stub-provider';
import { FakeNote, PROJECT, makeSync, remoteTasks } from './support/sync-harness';

/** Minted block ids are random, so they are left out of what a scenario compares. */
function withoutMintedAnchors(content: string): string {
  return content.replace(/ \^ots-[a-z0-9]{8}\b/g, '');
}

async function syncOnce(content: string, links: TaskLinkStore, tasks: LooseProviderTask[]): Promise<string> {
  const note = new FakeNote(content);
  await makeSync(note, links, { listTasks: remoteTasks(...tasks) }).run(PROJECT);

  return note.content;
}

function remote(task: LooseProviderTask): LooseProviderTask {
  return { projectId: PROJECT, ...task };
}

function parentAndChildLinks(): TaskLinkStore {
  return new TaskLinkStore([
    { blockId: 'ots-p', providerTaskId: 'tp', lastSyncedTitle: 'P' },
    { blockId: 'ots-c', providerTaskId: 'tc', lastSyncedTitle: 'C', lastSyncedParentBlockId: 'ots-p' },
  ]);
}

describe('TaskSync with several pulls landing on the same lines in one pass', () => {
  it('writes both fields when a task is renamed and labelled remotely', async () => {
    const links = new TaskLinkStore([
      { blockId: 'ots-a', providerTaskId: 'ta', lastSyncedTitle: 'Milk', lastSyncedTags: [] },
    ]);

    const content = await syncOnce('- [ ] Milk ^ots-a', links, [
      remote({ id: 'ta', title: 'Oat milk', labels: ['errands'], embeddedBlockId: 'ots-a' }),
    ]);

    expect(content).toBe('- [ ] Oat milk #errands ^ots-a');
  });

  it('writes new remote sub-tasks under both a parent and its nested child', async () => {
    const content = await syncOnce('- [ ] P ^ots-p\n\t- [ ] C ^ots-c', parentAndChildLinks(), [
      remote({ id: 'tp', title: 'P', embeddedBlockId: 'ots-p' }),
      remote({ id: 'tc', title: 'C', embeddedBlockId: 'ots-c', parentId: 'tp' }),
      remote({ id: 'n1', title: 'Under P', parentId: 'tp' }),
      remote({ id: 'n2', title: 'Under C', parentId: 'tc' }),
    ]);

    expect(withoutMintedAnchors(content)).toBe('- [ ] P ^ots-p\n\t- [ ] C ^ots-c\n\t\t- [ ] Under C\n\t- [ ] Under P');
  });

  it('keeps a child renamed remotely while a new remote sub-task lands under its parent', async () => {
    const content = await syncOnce('- [ ] P ^ots-p\n\t- [ ] C ^ots-c', parentAndChildLinks(), [
      remote({ id: 'tp', title: 'P', embeddedBlockId: 'ots-p' }),
      remote({ id: 'tc', title: 'C renamed', embeddedBlockId: 'ots-c', parentId: 'tp' }),
      remote({ id: 'n1', title: 'Under P', parentId: 'tp' }),
    ]);

    expect(withoutMintedAnchors(content)).toBe('- [ ] P ^ots-p\n\t- [ ] C renamed ^ots-c\n\t- [ ] Under P');
  });

  it('keeps a pulled description while a new remote sub-task lands under the same task', async () => {
    const links = new TaskLinkStore([{ blockId: 'ots-p', providerTaskId: 'tp', lastSyncedTitle: 'P' }]);

    const content = await syncOnce('- [ ] P ^ots-p', links, [
      remote({
        id: 'tp',
        title: 'P',
        description: 'Remote note\n\nObsidian Task Sync ID: ^ots-p',
        embeddedBlockId: 'ots-p',
      }),
      remote({ id: 'n1', title: 'Under P', parentId: 'tp' }),
    ]);

    expect(withoutMintedAnchors(content)).toBe('- [ ] P ^ots-p\n\tRemote note\n\t- [ ] Under P');
  });

  it('keeps the new title of a task renamed and moved to another parent remotely', async () => {
    const links = new TaskLinkStore([
      { blockId: 'ots-a', providerTaskId: 'ta', lastSyncedTitle: 'A' },
      { blockId: 'ots-b', providerTaskId: 'tb', lastSyncedTitle: 'B' },
      { blockId: 'ots-c', providerTaskId: 'tc', lastSyncedTitle: 'C', lastSyncedParentBlockId: 'ots-b' },
    ]);

    const content = await syncOnce('- [ ] A ^ots-a\n- [ ] B ^ots-b\n\t- [ ] C ^ots-c', links, [
      remote({ id: 'ta', title: 'A', embeddedBlockId: 'ots-a' }),
      remote({ id: 'tb', title: 'B', embeddedBlockId: 'ots-b' }),
      remote({ id: 'tc', title: 'C renamed', embeddedBlockId: 'ots-c', parentId: 'ta' }),
    ]);

    expect(content).toBe('- [ ] A ^ots-a\n\t- [ ] C renamed ^ots-c\n- [ ] B ^ots-b');
  });

  it('keeps the new title of a task renamed remotely whose parent was cleared', async () => {
    const content = await syncOnce('- [ ] P ^ots-p\n\t- [ ] C ^ots-c', parentAndChildLinks(), [
      remote({ id: 'tp', title: 'P', embeddedBlockId: 'ots-p' }),
      remote({ id: 'tc', title: 'C renamed', embeddedBlockId: 'ots-c' }),
    ]);

    expect(content).toBe('- [ ] P ^ots-p\n- [ ] C renamed ^ots-c');
  });

  it('moves a grandchild up under its grandparent without duplicating its line', async () => {
    const links = new TaskLinkStore([
      { blockId: 'ots-p', providerTaskId: 'tp', lastSyncedTitle: 'P' },
      { blockId: 'ots-b', providerTaskId: 'tb', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'ots-p' },
      { blockId: 'ots-c', providerTaskId: 'tc', lastSyncedTitle: 'C', lastSyncedParentBlockId: 'ots-b' },
    ]);

    const content = await syncOnce('- [ ] P ^ots-p\n\t- [ ] B ^ots-b\n\t\t- [ ] C ^ots-c', links, [
      remote({ id: 'tp', title: 'P', embeddedBlockId: 'ots-p' }),
      remote({ id: 'tb', title: 'B', embeddedBlockId: 'ots-b', parentId: 'tp' }),
      remote({ id: 'tc', title: 'C', embeddedBlockId: 'ots-c', parentId: 'tp' }),
    ]);

    expect(content).toBe('- [ ] P ^ots-p\n\t- [ ] B ^ots-b\n\t- [ ] C ^ots-c');
  });
});
