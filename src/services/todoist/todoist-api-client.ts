import { sanitizeForDisplay } from '../../utils/external-text';
import { HttpClient, HttpResponse } from '../http/http-client';
import { TaskProviderError, TaskProviderFailure } from '../task-provider-error';
import {
  NewTodoistTask,
  TodoistProject,
  TodoistTask,
  TodoistUser,
  describeCause,
  isDeletedTaskPayload,
  parseJson,
  throwOnErrorStatus,
  toCreateTaskPayload,
  toPage,
  toTodoistProject,
  toTodoistTask,
  toTodoistUser,
  withQuery,
} from './todoist-payloads';

export type { TodoistProject, TodoistTask, TodoistUser } from './todoist-payloads';

const API_BASE_URL = 'https://api.todoist.com/api/v1';
const JSON_CONTENT_TYPE = 'application/json';
const PAGE_SIZE = 200;
/** Guards against a server that keeps handing back a cursor; 200 pages is far past any real vault. */
const MAX_PAGES = 200;

export type TodoistTokenReader = () => string;

interface ApiCall {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly path: string;
  readonly payload?: Record<string, unknown>;
  /** What a 404 means for this call; to most calls it is simply unexpected. */
  readonly notFound?: TaskProviderFailure;
}

export class TodoistApiClient {
  private readonly http: HttpClient;
  private readonly readToken: TodoistTokenReader;

  constructor(http: HttpClient, readToken: TodoistTokenReader) {
    this.http = http;
    this.readToken = readToken;
  }

  async fetchUser(): Promise<TodoistUser> {
    return toTodoistUser(await this.get('/user'));
  }

  async listProjects(): Promise<TodoistProject[]> {
    return (await this.getAllPages('/projects', {})).map(toTodoistProject);
  }

  /** A deleted project answers with an empty list rather than a 404, so absence is ambiguous here. */
  async listTasks(projectId: string): Promise<TodoistTask[]> {
    return (await this.getAllPages('/tasks', { project_id: projectId })).map(toTodoistTask);
  }

  async createTask(task: NewTodoistTask): Promise<TodoistTask> {
    const created = await this.request({
      method: 'POST',
      path: '/tasks',
      payload: toCreateTaskPayload(task),
      notFound: 'project-missing',
    });

    return toTodoistTask(created);
  }

  async updateTaskContent(taskId: string, content: string): Promise<TodoistTask> {
    return toTodoistTask(await this.post(taskPath(taskId), { content }));
  }

  async updateTaskDescription(taskId: string, description: string): Promise<TodoistTask> {
    return toTodoistTask(await this.post(taskPath(taskId), { description }));
  }

  async updateTaskLabels(taskId: string, labels: readonly string[]): Promise<TodoistTask> {
    return toTodoistTask(await this.post(taskPath(taskId), { labels }));
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.request({ method: 'DELETE', path: taskPath(taskId) });
  }

  /** Todoist completes a task through this dedicated action, not a general field update. */
  async completeTask(taskId: string): Promise<void> {
    await this.request({ method: 'POST', path: taskPath(taskId, 'close') });
  }

  async reopenTask(taskId: string): Promise<void> {
    await this.request({ method: 'POST', path: taskPath(taskId, 'reopen') });
  }

  /**
   * The general update endpoint rejects `parent_id` outright, so reparenting goes through this
   * dedicated move action instead. Todoist also rejects a literal `null` there, so clearing a
   * parent is done by re-sending the task's current project instead of a parent at all.
   */
  async moveTask(taskId: string, parentId: string | undefined, projectId: string): Promise<TodoistTask> {
    const target = parentId === undefined ? { project_id: projectId } : { parent_id: parentId };

    return toTodoistTask(await this.post(taskPath(taskId, 'move'), target));
  }

  /**
   * A deleted task's id keeps answering with 200 rather than 404, marked only by `is_deleted` in
   * the body, so both signals are checked before treating a task as found.
   */
  async getTask(taskId: string): Promise<TodoistTask | undefined> {
    const response = await this.send({ method: 'GET', path: taskPath(taskId) });

    if (response.status === 404) {
      return undefined;
    }

    throwOnErrorStatus(response, 'unexpected');
    const payload = parseJson(response.text);

    return isDeletedTaskPayload(payload) ? undefined : toTodoistTask(payload);
  }

  async createProject(name: string): Promise<TodoistProject> {
    return toTodoistProject(await this.post('/projects', { name }));
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request({ method: 'DELETE', path: `/projects/${encodeURIComponent(projectId)}` });
  }

  private async getAllPages(path: string, query: Record<string, string>): Promise<unknown[]> {
    const results: unknown[] = [];
    let cursor = '';

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body = toPage(await this.get(withQuery(path, pageQuery(query, cursor))));

      results.push(...body.results);
      cursor = body.nextCursor;

      if (cursor.length === 0) {
        return results;
      }
    }

    throw new TaskProviderError('unexpected', 'The task list did not stop paginating.');
  }

  private async get(path: string): Promise<unknown> {
    return this.request({ method: 'GET', path });
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: 'POST', path, payload });
  }

  private async request(call: ApiCall): Promise<unknown> {
    const response = await this.send(call);
    throwOnErrorStatus(response, call.notFound ?? 'unexpected');

    return response.text.trim().length === 0 ? undefined : parseJson(response.text);
  }

  private async send(call: ApiCall): Promise<HttpResponse> {
    const request = {
      url: `${API_BASE_URL}${call.path}`,
      method: call.method,
      headers: { Authorization: `Bearer ${this.readToken()}` },
      ...(call.payload === undefined ? {} : { body: JSON.stringify(call.payload), contentType: JSON_CONTENT_TYPE }),
    };

    try {
      return await this.http.send(request);
    } catch (error) {
      throw new TaskProviderError('unreachable', sanitizeForDisplay(describeCause(error)));
    }
  }
}

function taskPath(taskId: string, action?: string): string {
  const path = `/tasks/${encodeURIComponent(taskId)}`;

  return action === undefined ? path : `${path}/${action}`;
}

function pageQuery(query: Record<string, string>, cursor: string): Record<string, string> {
  return { ...query, limit: String(PAGE_SIZE), ...(cursor.length === 0 ? {} : { cursor }) };
}
