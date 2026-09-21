import { Logger } from '../../utils/logger';
import { NewTask } from '../task-provider';
import { addChildNotice, removeChildNotice } from './child-notice';
import { TodoistApiClient, TodoistTask } from './todoist-api-client';
import { NewTodoistTask } from './todoist-payloads';

const logger = new Logger('TaskBridge:Todoist');

/**
 * Nesting a child under a completed parent behaves unexpectedly in Todoist: the parent is ignored
 * on the first try, and the child has to be moved under it again afterwards to actually land there
 * (architecture-rules.md rule 42). Completing a task is always a second call after creation, since
 * Todoist never creates a task already completed. An open child can never sit under a completed
 * parent at all — completing a parent completes its children, and reopening a child reopens its
 * parent — so it is held back entirely (on creation) or left where it is (on reparenting) and noted
 * on the parent instead.
 */
export class TodoistNesting {
  private readonly api: TodoistApiClient;

  constructor(api: TodoistApiClient) {
    this.api = api;
  }

  /** Undefined when the provider held the task back and created nothing at all. */
  async create(task: NewTask): Promise<TodoistTask | undefined> {
    const parent = task.parentId === undefined ? undefined : await this.api.getTask(task.parentId);

    if (parent === undefined) {
      return this.createAt(task, undefined);
    }

    if (parent.isCompleted) {
      if (!task.isCompleted) {
        await this.writeNotice(parent, task.title);
        return undefined;
      }

      return this.createUnderCompletedParent(task, parent.id);
    }

    const created = await this.createAt(task, parent.id);
    await this.removeNoticeIfPresent(parent, task.title);

    return created;
  }

  /** Resolves to whether the task now sits under the parent that was asked for. */
  async reparent(taskId: string, parentId: string | undefined, projectId: string): Promise<boolean> {
    const moved = await this.api.moveTask(taskId, parentId, projectId);

    if (parentId === undefined) {
      return true;
    }

    const parent = await this.api.getTask(parentId);
    const landed = moved.parentId === parentId;

    if (parent !== undefined) {
      await (landed ? this.removeNoticeIfPresent(parent, moved.content) : this.writeNotice(parent, moved.content));
    }

    return landed;
  }

  private async createAt(task: NewTask, parentId: string | undefined): Promise<TodoistTask> {
    const created = await this.api.createTask(toNewTodoistTask(task, parentId));

    return task.isCompleted ? await this.completeIfPossible(created) : created;
  }

  /** Created top-level first, since Todoist ignores the parent outright when it is completed. */
  private async createUnderCompletedParent(task: NewTask, parentId: string): Promise<TodoistTask> {
    const completed = await this.createAt(task, undefined);

    try {
      return await this.api.moveTask(completed.id, parentId, task.projectId);
    } catch (error) {
      logger.warn('Could not move a newly created task under its completed parent', { taskId: completed.id, error });
      return completed;
    }
  }

  /** Leaves a courtesy notice on the parent, until it reads otherwise. */
  private async writeNotice(parent: TodoistTask, title: string): Promise<void> {
    const description = addChildNotice(parent.description, title);

    if (description !== parent.description) {
      await this.api.updateTaskDescription(parent.id, description);
      logger.info('Noted a child task waiting for its completed parent to reopen', { parentTaskId: parent.id });
    }
  }

  /** A stale notice from an earlier held-back attempt, now resolved. A failed removal is not fatal. */
  private async removeNoticeIfPresent(parent: TodoistTask, title: string): Promise<void> {
    const description = removeChildNotice(parent.description, title);

    if (description === parent.description) {
      return;
    }

    try {
      await this.api.updateTaskDescription(parent.id, description);
      logger.info('Removed a child-waiting notice now that the child synced under its parent', {
        parentTaskId: parent.id,
      });
    } catch (error) {
      logger.warn('Could not remove a child-waiting notice from its parent', { parentTaskId: parent.id, error });
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
