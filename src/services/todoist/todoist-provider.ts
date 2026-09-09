import { App } from 'obsidian';
import { ObsidianHttpClient } from '../http/obsidian-http-client';
import { ProviderAccount, TaskProvider } from '../task-provider';
import { TaskProviderError } from '../task-provider-error';
import { TodoistApiClient, TodoistUser } from './todoist-api-client';

export class TodoistProvider implements TaskProvider {
  readonly displayName = 'Todoist';
  private readonly api: TodoistApiClient;

  constructor(api: TodoistApiClient) {
    this.api = api;
  }

  async connect(): Promise<ProviderAccount> {
    const user = await this.api.fetchUser();

    return { id: user.id, displayName: describeUser(user) };
  }
}

export function createTodoistProvider(app: App, readSecretName: () => string): TodoistProvider {
  const readToken = (): string => {
    const secretName = readSecretName();
    const token = secretName.length === 0 ? null : app.secretStorage.getSecret(secretName);

    if (token === null || token.length === 0) {
      throw new TaskProviderError('not-configured');
    }

    return token;
  };

  return new TodoistProvider(new TodoistApiClient(new ObsidianHttpClient(), readToken));
}

function describeUser(user: TodoistUser): string {
  return [user.fullName, user.email, user.id].find((value) => value.length > 0) ?? user.id;
}
