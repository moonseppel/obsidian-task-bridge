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
  embeddedBlockId?: string;
  /** Whether the task is done. A task missing from `listTasks` may still be completed rather than deleted or moved. */
  isCompleted: boolean;
  /** The project this task currently lives in, used to tell "completed but still here" apart from "moved elsewhere". */
  projectId: string;
  /** The raw current description, including this plugin's footer where one is present. */
  description: string;
  labels: readonly string[];
  /** The id of the task this one is nested under, when it is nested under one at all. */
  parentId?: string;
}

export interface NewTask {
  title: string;
  projectId: string;
  description?: string;
  labels?: readonly string[];
  /** The task to nest this one under, when it is created as a nested task. */
  parentId?: string;
  /** The state to create the task in; the line's own checkbox at the time it is created. */
  isCompleted: boolean;
}

/** The few words the settings tab needs to speak about this provider without naming it. */
export interface ProviderDescription {
  readonly displayName: string;
  readonly defaultProjectName: string;
}

export interface TaskProvider {
  readonly description: ProviderDescription;
  /**
   * A description as this provider will actually store it, declared only where the provider changes
   * one at all — Todoist strips the whole string, so whitespace at either end of it cannot carry
   * meaning. Leaving it out means the provider stores what it is given. Used to tell a genuine
   * remote edit apart from the provider's own normalization.
   */
  readonly storedDescription?: (description: string) => string;
  connect(): Promise<ProviderAccount>;
  listProjects(): Promise<ProviderProject[]>;
  listTasks(projectId: string): Promise<ProviderTask[]>;
  /**
   * Resolves to the task as the provider actually holds it, which may differ from what was asked,
   * or to nothing when the provider held creation back entirely rather than create anything at all.
   */
  createTask(task: NewTask): Promise<ProviderTask | undefined>;
  updateTaskTitle(taskId: string, title: string): Promise<void>;
  updateTaskDescription(taskId: string, description: string): Promise<void>;
  updateTaskLabels(taskId: string, labels: readonly string[]): Promise<void>;
  /** A dedicated action rather than a field update, because that is how Todoist completes a task. */
  completeTask(taskId: string): Promise<void>;
  reopenTask(taskId: string): Promise<void>;
  /**
   * A dedicated action rather than a field update, because Todoist rejects `parent_id` on the
   * general update endpoint. Clearing a parent (`parentId` undefined) still needs the task's
   * current project, since Todoist only accepts that as `project_id` re-sent on the same project.
   */
  reparentTask(taskId: string, parentId: string | undefined, projectId: string): Promise<void>;
  /** Moves the task to trash where the provider offers one, otherwise deletes it permanently. */
  removeTask(taskId: string): Promise<void>;
  /**
   * A task missing from a project's task list is ambiguous between deleted and moved elsewhere;
   * this tells them apart.
   */
  getTask(taskId: string): Promise<ProviderTask | undefined>;
}

export function defaultProjectOf(projects: readonly ProviderProject[]): ProviderProject {
  const fallback = projects.find((project) => project.isDefault) ?? projects[0];

  if (fallback === undefined) {
    throw new TaskProviderError('project-missing', 'The task manager listed no projects at all.');
  }

  return fallback;
}
