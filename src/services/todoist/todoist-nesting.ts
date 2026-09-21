import { Logger } from '../../utils/logger';
import { NewTask } from '../task-provider';
import { TodoistApiClient, TodoistTask } from './todoist-api-client';
import { NewTodoistTask } from './todoist-payloads';

const logger = new Logger('TaskBridge:Todoist');

/**
 * Nesting a child under a completed parent behaves unexpectedly in Todoist: the parent is ignored
 * on the first try, and the child has to be moved under it again afterwards to actually land there
 * (architecture-rules.md rule 42). Completing a task is always a second call after creation, since
 * Todoist never creates a task already completed.
 */
export class TodoistNesting {
  private readonly api: TodoistApiClient;

  constructor(api: TodoistApiClient) {
    this.api = api;
  }

  async create(task: NewTask): Promise<TodoistTask> {
    const parent = task.parentId === undefined ? undefined : await this.api.getTask(task.parentId);

    if (parent !== undefined && parent.isCompleted && task.isCompleted) {
      return this.createUnderCompletedParent(task, parent.id);
    }

    const created = await this.api.createTask(toNewTodoistTask(task, task.parentId));

    return task.isCompleted ? await this.completeIfPossible(created) : created;
  }

  /** Created top-level first, since Todoist ignores the parent outright when it is completed. */
  private async createUnderCompletedParent(task: NewTask, parentId: string): Promise<TodoistTask> {
    const created = await this.api.createTask(toNewTodoistTask(task, undefined));
    const completed = await this.completeIfPossible(created);

    try {
      return await this.api.moveTask(completed.id, parentId, task.projectId);
    } catch (error) {
      logger.warn('Could not move a newly created task under its completed parent', { taskId: completed.id, error });
      return completed;
    }
  }

  /** The task already exists once this is reached, so a failure here is logged rather than thrown. */
  private async completeIfPossible(task: TodoistTask): Promise<TodoistTask> {
    try {
      await this.api.completeTask(task.id);
      return { ...task, isCompleted: true };
    } catch (error) {
      logger.warn('Could not complete a newly created task', { taskId: task.id, error });
      return task;
    }
  }
}

function toNewTodoistTask(task: NewTask, parentId: string | undefined): NewTodoistTask {
  return { content: task.title, projectId: task.projectId, description: task.description, labels: task.labels, parentId };
}
