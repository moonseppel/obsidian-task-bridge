import { sanitizeForDisplay, sanitizeTitle } from '../../utils/external-text';
import { isRecord } from '../../utils/type-guards';
import { HttpClient, HttpResponse } from '../http/http-client';
import { TaskProviderError, TaskProviderFailure } from '../task-provider-error';

const API_BASE_URL = 'https://api.todoist.com/api/v1';
const JSON_CONTENT_TYPE = 'application/json';
const PAGE_SIZE = 200;
/** Guards against a server that keeps handing back a cursor; 200 pages is far past any real vault. */
const MAX_PAGES = 200;

export type TodoistTokenReader = () => string;

export interface TodoistUser {
  id: string;
  fullName: string;
  email: string;
}

export interface TodoistProject {
  id: string;
  name: string;
  isInbox: boolean;
}

export interface TodoistTask {
  id: string;
  content: string;
}

interface Page {
  results: unknown[];
  nextCursor: string | null;
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
    const results = await this.getAllPages('/projects', {});

    return results.map(toTodoistProject);
  }

  /** A deleted project answers with an empty list rather than a 404, so absence is ambiguous here. */
  async listTasks(projectId: string): Promise<TodoistTask[]> {
    const results = await this.getAllPages('/tasks', { project_id: projectId });

    return results.map(toTodoistTask);
  }

  async createTask(content: string, projectId: string): Promise<TodoistTask> {
    const created = await this.post('/tasks', { content, project_id: projectId }, 'project-missing');

    return toTodoistTask(created);
  }

  async updateTaskContent(taskId: string, content: string): Promise<TodoistTask> {
    return toTodoistTask(await this.post(`/tasks/${encodeURIComponent(taskId)}`, { content }));
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.request('DELETE', `/tasks/${encodeURIComponent(taskId)}`);
  }

  async createProject(name: string): Promise<TodoistProject> {
    return toTodoistProject(await this.post('/projects', { name }));
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request('DELETE', `/projects/${encodeURIComponent(projectId)}`);
  }

  private async getAllPages(
    path: string,
    query: Record<string, string>,
    notFound: TaskProviderFailure = 'unexpected',
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const parameters = { ...query, limit: String(PAGE_SIZE), ...(cursor === null ? {} : { cursor }) };
      const body = toPage(await this.get(withQuery(path, parameters), notFound));

      results.push(...body.results);
      cursor = body.nextCursor;

      if (cursor === null) {
        return results;
      }
    }

    throw new TaskProviderError('unexpected', 'The task list did not stop paginating.');
  }

  private async get(path: string, notFound: TaskProviderFailure = 'unexpected'): Promise<unknown> {
    return this.request('GET', path, undefined, notFound);
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

function withQuery(path: string, parameters: Record<string, string>): string {
  const query = Object.entries(parameters)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return query.length === 0 ? path : `${path}?${query}`;
}

function toPage(payload: unknown): Page {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new TaskProviderError('unexpected', 'A list response did not contain any results.');
  }

  return {
    results: payload.results,
    nextCursor: typeof payload.next_cursor === 'string' && payload.next_cursor.length > 0
      ? payload.next_cursor
      : null,
  };
}

function throwOnErrorStatus(response: HttpResponse, notFound: TaskProviderFailure): void {
  if (response.status >= 200 && response.status < 300) {
    return;
  }

  throw new TaskProviderError(
    failureForStatus(response.status, notFound),
    describeApiError(response.text),
  );
}

function failureForStatus(status: number, notFound: TaskProviderFailure): TaskProviderFailure {
  if (status === 401 || status === 403) {
    return 'invalid-credentials';
  }

  if (status === 404) {
    return notFound;
  }

  if (status === 429) {
    return 'rate-limited';
  }

  return status >= 500 ? 'unreachable' : 'unexpected';
}

function toTodoistUser(payload: unknown): TodoistUser {
  if (!isRecord(payload)) {
    throw new TaskProviderError('unexpected', 'The user response was not an object.');
  }

  const id = readIdentifier(payload.id);

  if (id.length === 0) {
    throw new TaskProviderError('unexpected', 'The user response did not contain a user id.');
  }

  return {
    id,
    fullName: sanitizeForDisplay(payload.full_name),
    email: sanitizeForDisplay(payload.email),
  };
}

function toTodoistProject(payload: unknown): TodoistProject {
  if (!isRecord(payload)) {
    throw new TaskProviderError('unexpected', 'A project entry was not an object.');
  }

  const id = readIdentifier(payload.id);

  if (id.length === 0) {
    throw new TaskProviderError('unexpected', 'A project entry did not contain a project id.');
  }

  return { id, name: sanitizeTitle(payload.name), isInbox: payload.inbox_project === true };
}

function toTodoistTask(payload: unknown): TodoistTask {
  if (!isRecord(payload)) {
    throw new TaskProviderError('unexpected', 'A task entry was not an object.');
  }

  const id = readIdentifier(payload.id);

  if (id.length === 0) {
    throw new TaskProviderError('unexpected', 'A task entry did not contain a task id.');
  }

  return { id, content: sanitizeTitle(payload.content) };
}

function readIdentifier(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return typeof value === 'number' ? String(value) : '';
}

function describeApiError(body: string): string {
  try {
    const payload: unknown = JSON.parse(body);
    return isRecord(payload) ? sanitizeForDisplay(payload.error) : '';
  } catch {
    return '';
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new TaskProviderError('unexpected', 'The response was not valid JSON.');
  }
}

function describeCause(error: unknown): string {
  return error instanceof Error ? error.message : '';
}
