import { App } from 'obsidian';
import { ObsidianHttpClient } from '../http/obsidian-http-client';
import { NewTask, ProviderAccount, ProviderProject, ProviderTask, TaskProvider } from '../task-provider';
import { TaskProviderError } from '../task-provider-error';
import { TodoistApiClient, TodoistProject, TodoistTask, TodoistUser } from './todoist-api-client';

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

  async listProjects(): Promise<ProviderProject[]> {
    return (await this.api.listProjects()).map(toProviderProject);
  }

  async listTasks(projectId: string): Promise<ProviderTask[]> {
    return (await this.api.listTasks(projectId)).map(toProviderTask);
  }

  async createTask(task: NewTask): Promise<ProviderTask> {
    return toProviderTask(await this.api.createTask(task.title, task.projectId));
  }

  async updateTaskTitle(taskId: string, title: string): Promise<void> {
    await this.api.updateTaskContent(taskId, title);
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

function toProviderProject(project: TodoistProject): ProviderProject {
  return { id: project.id, name: project.name, isDefault: project.isInbox };
}

function toProviderTask(task: TodoistTask): ProviderTask {
  return { id: task.id, title: task.content };
}

function describeUser(user: TodoistUser): string {
  return [user.fullName, user.email, user.id].find((value) => value.length > 0) ?? user.id;
}
