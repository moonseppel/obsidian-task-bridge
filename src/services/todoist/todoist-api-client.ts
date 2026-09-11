import { sanitizeForDisplay } from '../../utils/external-text';
import { HttpClient, HttpResponse } from '../http/http-client';
import { TaskProviderError, TaskProviderFailure } from '../task-provider-error';
import {
  TodoistProject,
  TodoistTask,
  TodoistUser,
  describeCause,
  isDeletedTaskPayload,
  parseJson,
  throwOnErrorStatus,
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

  async createTask(content: string, projectId: string, description?: string): Promise<TodoistTask> {
    return toTodoistTask(
      await this.post(
        '/tasks',
        { content, project_id: projectId, ...(description === undefined ? {} : { description }) },
        'project-missing',
      ),
    );
  }

  async updateTaskContent(taskId: string, content: string): Promise<TodoistTask> {
    return toTodoistTask(await this.post(`/tasks/${encodeURIComponent(taskId)}`, { content }));
  }

  async updateTaskDescription(taskId: string, description: string): Promise<TodoistTask> {
    return toTodoistTask(await this.post(`/tasks/${encodeURIComponent(taskId)}`, { description }));
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.request('DELETE', `/tasks/${encodeURIComponent(taskId)}`);
  }

  /**
   * A deleted task's id keeps answering with 200 rather than 404, marked only by `is_deleted` in
   * the body, so both signals are checked before treating a task as found.
   */
  async getTask(taskId: string): Promise<TodoistTask | undefined> {
    const response = await this.send('GET', `/tasks/${encodeURIComponent(taskId)}`);

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
    await this.request('DELETE', `/projects/${encodeURIComponent(projectId)}`);
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
    return this.request('GET', path);
  }

  private async post(
    path: string,
    payload: Record<string, string>,
    notFound: TaskProviderFailure = 'unexpected',
  ): Promise<unknown> {
    return this.request('POST', path, JSON.stringify(payload), notFound);
  }

  private async request(
    method: string,
    path: string,
    body?: string,
    notFound: TaskProviderFailure = 'unexpected',
  ): Promise<unknown> {
    const response = await this.send(method, path, body);
    throwOnErrorStatus(response, notFound);

    return response.text.trim().length === 0 ? null : parseJson(response.text);
  }

  private async send(method: string, path: string, body?: string): Promise<HttpResponse> {
    const request = {
      url: `${API_BASE_URL}${path}`,
      method,
      headers: { Authorization: `Bearer ${this.readToken()}` },
      ...(body === undefined ? {} : { body, contentType: JSON_CONTENT_TYPE }),
    };

    try {
      return await this.http.send(request);
    } catch (error) {
      throw new TaskProviderError('unreachable', sanitizeForDisplay(describeCause(error)));
    }
  }
}

function pageQuery(query: Record<string, string>, cursor: string): Record<string, string> {
  return { ...query, limit: String(PAGE_SIZE), ...(cursor.length === 0 ? {} : { cursor }) };
}
