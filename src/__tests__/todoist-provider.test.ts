import { App } from 'obsidian';
import { TodoistApiClient, TodoistUser } from '../services/todoist/todoist-api-client';
import { TodoistProvider, createTodoistProvider } from '../services/todoist/todoist-provider';

function providerReturning(user: Partial<TodoistUser>): TodoistProvider {
  const api = {
    fetchUser: (): Promise<TodoistUser> =>
      Promise.resolve({ id: 'user-1', fullName: '', email: '', ...user }),
  } as unknown as TodoistApiClient;

  return new TodoistProvider(api);
}

function appWithSecret(secret: string | null): App {
  return { secretStorage: { getSecret: (): string | null => secret } } as unknown as App;
}

describe('TodoistProvider', () => {
  it('is named after the provider it talks to', () => {
    expect(providerReturning({}).displayName).toBe('Todoist');
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

describe('createTodoistProvider', () => {
  it('reports a missing configuration when no secret is selected', async () => {
    const provider = createTodoistProvider(appWithSecret('a-token'), () => '');
    await expect(provider.connect()).rejects.toMatchObject({ failure: 'not-configured' });
  });

  it('reports a missing configuration when the selected secret holds no token', async () => {
    const provider = createTodoistProvider(appWithSecret(null), () => 'todoist-api-token');
    await expect(provider.connect()).rejects.toMatchObject({ failure: 'not-configured' });
  });

  it('reports a missing configuration when the selected secret is empty', async () => {
    const provider = createTodoistProvider(appWithSecret(''), () => 'todoist-api-token');
    await expect(provider.connect()).rejects.toMatchObject({ failure: 'not-configured' });
  });
});
