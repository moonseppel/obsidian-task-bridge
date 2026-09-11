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
      listTasks: () => Promise.resolve([{ id: 't1', content: 'Buy milk' }]),
    });

    await expect(provider.listTasks('p1')).resolves.toEqual([{ id: 't1', title: 'Buy milk' }]);
  });

  it('creates a task from a title and a project', async () => {
    const created: Array<[string, string]> = [];
    const provider = providerOver({
      createTask: (content: string, projectId: string) => {
        created.push([content, projectId]);
        return Promise.resolve({ id: 't1', content });
      },
    });

    await expect(provider.createTask({ title: 'Buy milk', projectId: 'p1' })).resolves.toEqual({
      id: 't1',
      title: 'Buy milk',
    });
    expect(created).toEqual([['Buy milk', 'p1']]);
  });

  it('updates a title without handing the caller the raw response', async () => {
    const provider = providerOver({
      updateTaskContent: (_id: string, content: string) => Promise.resolve({ id: 't1', content }),
    });

    await expect(provider.updateTaskTitle('t1', 'Buy oat milk')).resolves.toBeUndefined();
  });
});
