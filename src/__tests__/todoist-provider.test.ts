import { TodoistApiClient, TodoistUser } from '../services/todoist/todoist-api-client';
import { TodoistProvider } from '../services/todoist/todoist-provider';

function providerReturning(user: Partial<TodoistUser>): TodoistProvider {
  const api = {
    fetchUser: (): Promise<TodoistUser> =>
      Promise.resolve({ id: 'user-1', fullName: '', email: '', ...user }),
  } as unknown as TodoistApiClient;

  return new TodoistProvider(api);
}

describe('TodoistProvider', () => {
  it('is named after the provider it talks to', () => {
    expect(providerReturning({}).description.displayName).toBe('Todoist');
  });

  it('reports the connected account id', async () => {
    await expect(providerReturning({ id: 'user-42' }).connect()).resolves.toMatchObject({ id: 'user-42' });
  });

  it('prefers the full name when describing the account', async () => {
    const provider = providerReturning({ fullName: 'Jan Pralle', email: 'jan@example.com' });
    await expect(provider.connect()).resolves.toMatchObject({ displayName: 'Jan Pralle' });
  });

  it('falls back to the email when the account has no full name', async () => {
    const provider = providerReturning({ email: 'jan@example.com' });
    await expect(provider.connect()).resolves.toMatchObject({ displayName: 'jan@example.com' });
  });

  it('falls back to the id when the account has neither name nor email', async () => {
    await expect(providerReturning({ id: 'user-7' }).connect()).resolves.toMatchObject({ displayName: 'user-7' });
  });
});

describe('TodoistProvider task and project mapping', () => {
  function providerOver(api: Partial<TodoistApiClient>): TodoistProvider {
    return new TodoistProvider(api as TodoistApiClient);
  }

  it('presents Todoist projects in provider-neutral shape', async () => {
    const provider = providerOver({
      listProjects: () => Promise.resolve([{ id: 'p1', name: 'Errands', isInbox: false }]),
    });

    await expect(provider.listProjects()).resolves.toEqual([
      { id: 'p1', name: 'Errands', isDefault: false },
    ]);
  });

  it('reports the Inbox as the provider default, without naming Todoist', async () => {
    const provider = providerOver({
      listProjects: () => Promise.resolve([{ id: 'p1', name: 'Inbox', isInbox: true }]),
    });

    await expect(provider.listProjects()).resolves.toEqual([
      { id: 'p1', name: 'Inbox', isDefault: true },
    ]);
  });

  it('renames Todoist "content" to the neutral "title"', async () => {
    const provider = providerOver({
      listTasks: () => Promise.resolve([{ id: 't1', content: 'Buy milk', isCompleted: false, projectId: 'p1' }]),
    });

    await expect(provider.listTasks('p1')).resolves.toEqual([
      { id: 't1', title: 'Buy milk', isCompleted: false, projectId: 'p1' },
    ]);
  });

  it('carries the task last-modified time through to the provider-neutral shape', async () => {
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([
          { id: 't1', content: 'Buy milk', updatedAt: 1700000000000, isCompleted: false, projectId: 'p1' },
        ]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ updatedAt: 1700000000000 }]);
  });

  it('carries the embedded block id through to the provider-neutral shape', async () => {
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([
          { id: 't1', content: 'Buy milk', embeddedBlockId: 'ots-a1b2c3d4', isCompleted: false, projectId: 'p1' },
        ]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ embeddedBlockId: 'ots-a1b2c3d4' }]);
  });

  it('carries completion state and the current project through to the provider-neutral shape', async () => {
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([{ id: 't1', content: 'Buy milk', isCompleted: true, projectId: 'p2' }]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ isCompleted: true, projectId: 'p2' }]);
  });

  it('sends the description on to the API client when creating a task', async () => {
    const created: Array<string | undefined> = [];
    const provider = providerOver({
      createTask: (content: string, _projectId: string, description?: string) => {
        created.push(description);
        return Promise.resolve({ id: 't1', content, isCompleted: false, projectId: 'p1' });
      },
    });

    await provider.createTask({ title: 'Buy milk', projectId: 'p1', description: '^ots-a1b2c3d4' });

    expect(created).toEqual(['^ots-a1b2c3d4']);
  });

  it('creates a task from a title and a project', async () => {
    const created: Array<[string, string]> = [];
    const provider = providerOver({
      createTask: (content: string, projectId: string) => {
        created.push([content, projectId]);
        return Promise.resolve({ id: 't1', content, isCompleted: false, projectId });
      },
    });

    await expect(provider.createTask({ title: 'Buy milk', projectId: 'p1' })).resolves.toEqual({
      id: 't1',
      title: 'Buy milk',
      isCompleted: false,
      projectId: 'p1',
    });
    expect(created).toEqual([['Buy milk', 'p1']]);
  });

  it('updates a title without handing the caller the raw response', async () => {
    const provider = providerOver({
      updateTaskContent: (_id: string, content: string) =>
        Promise.resolve({ id: 't1', content, isCompleted: false, projectId: 'p1' }),
    });

    await expect(provider.updateTaskTitle('t1', 'Buy oat milk')).resolves.toBeUndefined();
  });

  it('sends a description update on to the API client', async () => {
    const updated: Array<[string, string]> = [];
    const provider = providerOver({
      updateTaskDescription: (id: string, description: string) => {
        updated.push([id, description]);
        return Promise.resolve({ id, content: 'Buy milk', isCompleted: false, projectId: 'p1' });
      },
    });

    await expect(provider.updateTaskDescription('t1', 'Now orphaned.\n^ots-a1')).resolves.toBeUndefined();
    expect(updated).toEqual([['t1', 'Now orphaned.\n^ots-a1']]);
  });

  it('completes a task through the dedicated close action', async () => {
    const closed: string[] = [];
    const provider = providerOver({
      completeTask: (id: string) => {
        closed.push(id);
        return Promise.resolve();
      },
    });

    await expect(provider.completeTask('t1')).resolves.toBeUndefined();
    expect(closed).toEqual(['t1']);
  });

  it('reopens a task through the dedicated reopen action', async () => {
    const reopened: string[] = [];
    const provider = providerOver({
      reopenTask: (id: string) => {
        reopened.push(id);
        return Promise.resolve();
      },
    });

    await expect(provider.reopenTask('t1')).resolves.toBeUndefined();
    expect(reopened).toEqual(['t1']);
  });

  it('removes a task by deleting it, since Todoist offers no trash for tasks', async () => {
    const deleted: string[] = [];
    const provider = providerOver({
      deleteTask: (id: string) => {
        deleted.push(id);
        return Promise.resolve();
      },
    });

    await expect(provider.removeTask('t1')).resolves.toBeUndefined();
    expect(deleted).toEqual(['t1']);
  });

  it('presents a task fetched directly by id in provider-neutral shape', async () => {
    const provider = providerOver({
      getTask: () => Promise.resolve({ id: 't1', content: 'Buy milk', isCompleted: false, projectId: 'p1' }),
    });

    await expect(provider.getTask('t1')).resolves.toEqual({
      id: 't1',
      title: 'Buy milk',
      isCompleted: false,
      projectId: 'p1',
    });
  });

  it('reports a task the client could not find as undefined', async () => {
    const provider = providerOver({
      getTask: () => Promise.resolve(undefined),
    });

    await expect(provider.getTask('t1')).resolves.toBeUndefined();
  });
});
