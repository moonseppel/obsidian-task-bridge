import { sanitizeForDisplay } from '../../utils/external-text';
import { isRecord } from '../../utils/type-guards';
import { HttpClient, HttpResponse } from '../http/http-client';
import { TaskProviderError, TaskProviderFailure } from '../task-provider-error';

const API_BASE_URL = 'https://api.todoist.com/api/v1';

export type TodoistTokenReader = () => string;

export interface TodoistUser {
  id: string;
  fullName: string;
  email: string;
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

  private async get(path: string): Promise<unknown> {
    const response = await this.send(path);
    throwOnErrorStatus(response);

    return parseJson(response.text);
  }

  private async send(path: string): Promise<HttpResponse> {
    const request = {
      url: `${API_BASE_URL}${path}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${this.readToken()}` },
    };

    try {
      return await this.http.send(request);
    } catch (error) {
      throw new TaskProviderError('unreachable', sanitizeForDisplay(describeCause(error)));
    }
  }
}

function throwOnErrorStatus(response: HttpResponse): void {
  if (response.status >= 200 && response.status < 300) {
    return;
  }

  throw new TaskProviderError(failureForStatus(response.status), describeApiError(response.text));
}

function failureForStatus(status: number): TaskProviderFailure {
  if (status === 401 || status === 403) {
    return 'invalid-credentials';
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
