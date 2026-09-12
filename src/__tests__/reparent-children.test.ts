import { promoteChildrenToTopLevel } from '../services/sync/reparent-children';
import { ProviderTask } from '../services/task-provider';

function task(overrides: Partial<ProviderTask> & { id: string }): ProviderTask {
  return { title: '', isCompleted: false, projectId: 'p1', description: '', labels: [], ...overrides };
}

describe('promoteChildrenToTopLevel', () => {
  it('clears the parent of every direct child of the given task', async () => {
    const reparented: Array<[string, string | undefined, string]> = [];
    const provider = {
      reparentTask: (taskId: string, parentId: string | undefined, projectId: string) => {
        reparented.push([taskId, parentId, projectId]);
        return Promise.resolve();
      },
    } as unknown as Parameters<typeof promoteChildrenToTopLevel>[0];

    const tasks = [
      task({ id: 'parent' }),
      task({ id: 'child-1', parentId: 'parent' }),
      task({ id: 'child-2', parentId: 'parent' }),
      task({ id: 'unrelated', parentId: 'someone-else' }),
    ];

    await promoteChildrenToTopLevel(provider, tasks, 'parent', 'p1');

    expect(reparented).toEqual([
      ['child-1', undefined, 'p1'],
      ['child-2', undefined, 'p1'],
    ]);
  });

  it('does nothing when the task has no children', async () => {
    const reparented: string[] = [];
    const provider = {
      reparentTask: (taskId: string) => {
        reparented.push(taskId);
        return Promise.resolve();
      },
    } as unknown as Parameters<typeof promoteChildrenToTopLevel>[0];

    await promoteChildrenToTopLevel(provider, [task({ id: 'lonely' })], 'lonely', 'p1');

    expect(reparented).toEqual([]);
  });

  it('only reparents direct children, leaving a grandchild to the child it still belongs to', async () => {
    const reparented: string[] = [];
    const provider = {
      reparentTask: (taskId: string) => {
        reparented.push(taskId);
        return Promise.resolve();
      },
    } as unknown as Parameters<typeof promoteChildrenToTopLevel>[0];

    const tasks = [
      task({ id: 'parent' }),
      task({ id: 'child', parentId: 'parent' }),
      task({ id: 'grandchild', parentId: 'child' }),
    ];

    await promoteChildrenToTopLevel(provider, tasks, 'parent', 'p1');

    expect(reparented).toEqual(['child']);
  });
});
