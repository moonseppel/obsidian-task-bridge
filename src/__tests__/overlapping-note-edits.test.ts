import { TaskLinkStore } from '../services/sync/task-links';
import { LooseProviderTask } from './support/stub-provider';
import { FakeNote, PROJECT, makeSync, remoteTasks } from './support/sync-harness';

/** Minted block ids are random, so they are left out of what a scenario compares. */
function withoutMintedAnchors(content: string): string {
  return content.replace(/ \^tb-[a-z0-9]{8}\b/g, '');
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
    { blockId: 'tb-p', providerTaskId: 'tp', lastSyncedTitle: 'P' },
    { blockId: 'tb-c', providerTaskId: 'tc', lastSyncedTitle: 'C', lastSyncedParentBlockId: 'tb-p' },
  ]);
}

describe('TaskSync with several pulls landing on the same lines in one pass', () => {
  it('writes both fields when a task is renamed and labelled remotely', async () => {
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'ta', lastSyncedTitle: 'Milk', lastSyncedTags: [] },
    ]);

    const content = await syncOnce('- [ ] Milk ^tb-a', links, [
      remote({ id: 'ta', title: 'Oat milk', labels: ['errands'], embeddedBlockId: 'tb-a' }),
    ]);

    expect(content).toBe('- [ ] Oat milk #errands ^tb-a');
  });

  it('writes new remote sub-tasks under both a parent and its nested child', async () => {
    const content = await syncOnce('- [ ] P ^tb-p\n\t- [ ] C ^tb-c', parentAndChildLinks(), [
      remote({ id: 'tp', title: 'P', embeddedBlockId: 'tb-p' }),
      remote({ id: 'tc', title: 'C', embeddedBlockId: 'tb-c', parentId: 'tp' }),
      remote({ id: 'n1', title: 'Under P', parentId: 'tp' }),
      remote({ id: 'n2', title: 'Under C', parentId: 'tc' }),
    ]);

    expect(withoutMintedAnchors(content)).toBe('- [ ] P ^tb-p\n\t- [ ] C ^tb-c\n\t\t- [ ] Under C\n\t- [ ] Under P');
  });

  it('keeps a child renamed remotely while a new remote sub-task lands under its parent', async () => {
    const content = await syncOnce('- [ ] P ^tb-p\n\t- [ ] C ^tb-c', parentAndChildLinks(), [
      remote({ id: 'tp', title: 'P', embeddedBlockId: 'tb-p' }),
      remote({ id: 'tc', title: 'C renamed', embeddedBlockId: 'tb-c', parentId: 'tp' }),
      remote({ id: 'n1', title: 'Under P', parentId: 'tp' }),
    ]);

    expect(withoutMintedAnchors(content)).toBe('- [ ] P ^tb-p\n\t- [ ] C renamed ^tb-c\n\t- [ ] Under P');
  });

  it('keeps a pulled description while a new remote sub-task lands under the same task', async () => {
    const links = new TaskLinkStore([{ blockId: 'tb-p', providerTaskId: 'tp', lastSyncedTitle: 'P' }]);

    const content = await syncOnce('- [ ] P ^tb-p', links, [
      remote({
        id: 'tp',
        title: 'P',
        description: 'Remote note\n\nTaskBridge ID: ^tb-p',
        embeddedBlockId: 'tb-p',
      }),
      remote({ id: 'n1', title: 'Under P', parentId: 'tp' }),
    ]);

    expect(withoutMintedAnchors(content)).toBe('- [ ] P ^tb-p\n\tRemote note\n\t- [ ] Under P');
  });

  it('keeps the new title of a task renamed and moved to another parent remotely', async () => {
    const links = new TaskLinkStore([
      { blockId: 'tb-a', providerTaskId: 'ta', lastSyncedTitle: 'A' },
      { blockId: 'tb-b', providerTaskId: 'tb', lastSyncedTitle: 'B' },
      { blockId: 'tb-c', providerTaskId: 'tc', lastSyncedTitle: 'C', lastSyncedParentBlockId: 'tb-b' },
    ]);

    const content = await syncOnce('- [ ] A ^tb-a\n- [ ] B ^tb-b\n\t- [ ] C ^tb-c', links, [
      remote({ id: 'ta', title: 'A', embeddedBlockId: 'tb-a' }),
      remote({ id: 'tb', title: 'B', embeddedBlockId: 'tb-b' }),
      remote({ id: 'tc', title: 'C renamed', embeddedBlockId: 'tb-c', parentId: 'ta' }),
    ]);

    expect(content).toBe('- [ ] A ^tb-a\n\t- [ ] C renamed ^tb-c\n- [ ] B ^tb-b');
  });

  it('keeps the new title of a task renamed remotely whose parent was cleared', async () => {
    const content = await syncOnce('- [ ] P ^tb-p\n\t- [ ] C ^tb-c', parentAndChildLinks(), [
      remote({ id: 'tp', title: 'P', embeddedBlockId: 'tb-p' }),
      remote({ id: 'tc', title: 'C renamed', embeddedBlockId: 'tb-c' }),
    ]);

    expect(content).toBe('- [ ] P ^tb-p\n- [ ] C renamed ^tb-c');
  });

  it('moves a grandchild up under its grandparent without duplicating its line', async () => {
    const links = new TaskLinkStore([
      { blockId: 'tb-p', providerTaskId: 'tp', lastSyncedTitle: 'P' },
      { blockId: 'tb-b', providerTaskId: 'tb', lastSyncedTitle: 'B', lastSyncedParentBlockId: 'tb-p' },
      { blockId: 'tb-c', providerTaskId: 'tc', lastSyncedTitle: 'C', lastSyncedParentBlockId: 'tb-b' },
    ]);

    const content = await syncOnce('- [ ] P ^tb-p\n\t- [ ] B ^tb-b\n\t\t- [ ] C ^tb-c', links, [
      remote({ id: 'tp', title: 'P', embeddedBlockId: 'tb-p' }),
      remote({ id: 'tb', title: 'B', embeddedBlockId: 'tb-b', parentId: 'tp' }),
      remote({ id: 'tc', title: 'C', embeddedBlockId: 'tb-c', parentId: 'tp' }),
    ]);

    expect(content).toBe('- [ ] P ^tb-p\n\t- [ ] B ^tb-b\n\t- [ ] C ^tb-c');
  });
});
