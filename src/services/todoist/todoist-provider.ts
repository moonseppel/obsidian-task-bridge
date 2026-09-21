import { ObsidianHttpClient } from '../http/obsidian-http-client';
import { NewTask, ProviderAccount, ProviderProject, ProviderTask, TaskProvider } from '../task-provider';
import { childNoticesIn, withChildNotices, withoutChildNotices } from './child-notice';
import { TodoistApiClient, TodoistProject, TodoistTask, TodoistUser } from './todoist-api-client';
import { TodoistCredentials } from './todoist-credentials';
import { TodoistNesting } from './todoist-nesting';

export class TodoistProvider implements TaskProvider {
  readonly description = { displayName: 'Todoist', defaultProjectName: 'Inbox' };
  private readonly api: TodoistApiClient;
  private readonly nesting: TodoistNesting;

  constructor(api: TodoistApiClient) {
    this.api = api;
    this.nesting = new TodoistNesting(api);
  }

  /** Todoist stores a description with the whole string stripped, keeping every byte between its ends. */
  storedDescription(description: string): string {
    return description.trim();
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

  async createTask(task: NewTask): Promise<ProviderTask | undefined> {
    const created = await this.nesting.create(task);

    return created === undefined ? undefined : toProviderTask(created);
  }

  async updateTaskTitle(taskId: string, title: string): Promise<void> {
    await this.api.updateTaskContent(taskId, title);
  }

  /** Reads the task first so a notice this plugin left on it survives the overwrite. */
  async updateTaskDescription(taskId: string, description: string): Promise<void> {
    const current = await this.api.getTask(taskId);
    const notices = current === undefined ? [] : childNoticesIn(current.description);

    await this.api.updateTaskDescription(taskId, withChildNotices(description, notices));
  }

  async updateTaskLabels(taskId: string, labels: readonly string[]): Promise<void> {
    await this.api.updateTaskLabels(taskId, labels);
  }

  async completeTask(taskId: string): Promise<void> {
    await this.api.completeTask(taskId);
  }

  async reopenTask(taskId: string): Promise<void> {
    await this.api.reopenTask(taskId);
  }

  async reparentTask(taskId: string, parentId: string | undefined, projectId: string): Promise<void> {
    await this.api.moveTask(taskId, parentId, projectId);
  }

  /** Todoist offers no trash for tasks, so removal here is always the permanent delete. */
  async removeTask(taskId: string): Promise<void> {
    await this.api.deleteTask(taskId);
  }

  async getTask(taskId: string): Promise<ProviderTask | undefined> {
    const task = await this.api.getTask(taskId);

    return task === undefined ? undefined : toProviderTask(task);
  }
}

export function createTodoistProvider(credentials: TodoistCredentials): TodoistProvider {
  return new TodoistProvider(new TodoistApiClient(new ObsidianHttpClient(), () => credentials.readToken()));
}

function toProviderProject(project: TodoistProject): ProviderProject {
  return { id: project.id, name: project.name, isDefault: project.isInbox };
}

function toProviderTask(task: TodoistTask): ProviderTask {
  return {
    id: task.id,
    title: task.content,
    updatedAt: task.updatedAt,
    embeddedBlockId: task.embeddedBlockId,
    isCompleted: task.isCompleted,
    projectId: task.projectId,
    description: withoutChildNotices(task.description),
    labels: task.labels,
    parentId: task.parentId,
  };
}

function describeUser(user: TodoistUser): string {
  return [user.fullName, user.email, user.id].find((value) => value.length > 0) ?? user.id;
}
