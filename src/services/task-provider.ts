import { TaskProviderError } from './task-provider-error';

export interface ProviderAccount {
  id: string;
  displayName: string;
}

export interface ProviderProject {
  id: string;
  name: string;
  /** The project the provider files tasks into when none is chosen, such as Todoist's Inbox. */
  isDefault: boolean;
}

export interface ProviderTask {
  id: string;
  title: string;
  /** Epoch ms the task was last modified, when the provider exposes one. */
  updatedAt?: number;
}

export interface NewTask {
  title: string;
  projectId: string;
}

/** The few words the settings tab needs to speak about this provider without naming it. */
export interface ProviderDescription {
  readonly displayName: string;
  readonly defaultProjectName: string;
}

export interface TaskProvider {
  readonly description: ProviderDescription;
  connect(): Promise<ProviderAccount>;
  listProjects(): Promise<ProviderProject[]>;
  listTasks(projectId: string): Promise<ProviderTask[]>;
  createTask(task: NewTask): Promise<ProviderTask>;
  updateTaskTitle(taskId: string, title: string): Promise<void>;
}

/** The provider's own default, or failing that the first project it lists. */
export function defaultProjectOf(projects: readonly ProviderProject[]): ProviderProject {
  const fallback = projects.find((project) => project.isDefault) ?? projects[0];

  if (fallback === undefined) {
    throw new TaskProviderError('project-missing', 'The task manager listed no projects at all.');
  }

  return fallback;
}
