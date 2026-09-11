import { sanitizeForDisplay, sanitizeTitle } from '../../utils/external-text';
import { isRecord } from '../../utils/type-guards';
import { HttpResponse } from '../http/http-client';
import { TaskProviderError, TaskProviderFailure } from '../task-provider-error';

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
  /** Epoch ms the task was last modified, when Todoist's answer parses as a date. */
  updatedAt?: number;
  /** The Obsidian block id embedded in this task's description, if it carries one. */
  embeddedBlockId?: string;
}

export interface Page {
  results: unknown[];
  nextCursor: string;
}

export function withQuery(path: string, parameters: Record<string, string>): string {
  const query = Object.entries(parameters)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return query.length === 0 ? path : `${path}?${query}`;
}

/** An empty cursor means the last page, which spares every caller a null check. */
export function toPage(payload: unknown): Page {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new TaskProviderError('unexpected', 'A list response did not contain any results.');
  }

  return {
    results: payload.results,
    nextCursor: typeof payload.next_cursor === 'string' ? payload.next_cursor : '',
  };
}

export function throwOnErrorStatus(response: HttpResponse, notFound: TaskProviderFailure): void {
  if (response.status >= 200 && response.status < 300) {
    return;
  }

  throw new TaskProviderError(
    failureForStatus(response.status, notFound),
    describeApiError(response.text),
  );
}

export function toTodoistUser(payload: unknown): TodoistUser {
  const record = requireRecord(payload, 'The user response was not an object.');
  const id = readIdentifier(record.id, 'The user response did not contain a user id.');

  return {
    id,
    fullName: sanitizeForDisplay(record.full_name),
    email: sanitizeForDisplay(record.email),
  };
}

export function toTodoistProject(payload: unknown): TodoistProject {
  const record = requireRecord(payload, 'A project entry was not an object.');
  const id = readIdentifier(record.id, 'A project entry did not contain a project id.');

  return { id, name: sanitizeTitle(record.name), isInbox: record.inbox_project === true };
}

export function toTodoistTask(payload: unknown): TodoistTask {
  const record = requireRecord(payload, 'A task entry was not an object.');
  const id = readIdentifier(record.id, 'A task entry did not contain a task id.');

  return {
    id,
    content: sanitizeTitle(record.content),
    updatedAt: toEpochMs(record.updated_at),
    embeddedBlockId: findEmbeddedBlockId(record.description),
  };
}

export function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new TaskProviderError('unexpected', 'The response was not valid JSON.');
  }
}

export function describeCause(error: unknown): string {
  return error instanceof Error ? error.message : '';
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

function requireRecord(payload: unknown, complaint: string): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new TaskProviderError('unexpected', complaint);
  }

  return payload;
}

/** Tolerant like readIdentifier and toPage: an invalid or missing timestamp becomes undefined, never a thrown error. */
function toEpochMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * The block id may be anywhere in the description, never assumed to be at a fixed position,
 * since the user is free to edit the description after the plugin wrote it.
 */
const EMBEDDED_BLOCK_ID = /\^([A-Za-z0-9-]+)/;

function findEmbeddedBlockId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = EMBEDDED_BLOCK_ID.exec(value);

  return match === null ? undefined : match[1];
}

function readIdentifier(value: unknown, complaint: string): string {
  const id = typeof value === 'number' ? String(value) : value;

  if (typeof id !== 'string' || id.length === 0) {
    throw new TaskProviderError('unexpected', complaint);
  }

  return id;
}

function describeApiError(body: string): string {
  try {
    const payload: unknown = JSON.parse(body);
    return isRecord(payload) ? sanitizeForDisplay(payload.error) : '';
  } catch {
    return '';
  }
}
