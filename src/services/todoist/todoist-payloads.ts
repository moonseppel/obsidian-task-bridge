import { sanitizeDescription, sanitizeForDisplay, sanitizeTitle } from '../../utils/external-text';
import { isRecord } from '../../utils/type-guards';
import { HttpResponse } from '../http/http-client';
import { findFooterBlockId } from '../sync/task-format/task-footer';
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
  embeddedBlockId?: string;
  /** Todoist's `checked` field: true once the task is completed. */
  isCompleted: boolean;
  projectId: string;
  description: string;
  labels: string[];
  parentId?: string;
}

export interface NewTodoistTask {
  readonly content: string;
  readonly projectId: string;
  readonly description?: string;
  readonly labels?: readonly string[];
  readonly parentId?: string;
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

/** A deleted task keeps answering GET with 200, never 404 — Todoist marks it in the body instead. */
export function isDeletedTaskPayload(payload: unknown): boolean {
  return isRecord(payload) && payload.is_deleted === true;
}

export function toTodoistTask(payload: unknown): TodoistTask {
  const record = requireRecord(payload, 'A task entry was not an object.');
  const id = readIdentifier(record.id, 'A task entry did not contain a task id.');

  return {
    id,
    content: sanitizeTitle(record.content),
    updatedAt: toEpochMs(record.updated_at),
    embeddedBlockId: findEmbeddedBlockId(record.description),
    isCompleted: record.checked === true,
    projectId: toProjectId(record.project_id),
    description: sanitizeDescription(record.description),
    labels: toLabels(record.labels),
    parentId: toOptionalId(record.parent_id),
  };
}

export function toCreateTaskPayload(task: NewTodoistTask): Record<string, unknown> {
  return {
    content: task.content,
    project_id: task.projectId,
    ...(task.description === undefined ? {} : { description: task.description }),
    ...(task.labels === undefined || task.labels.length === 0 ? {} : { labels: task.labels }),
    ...(task.parentId === undefined ? {} : { parent_id: task.parentId }),
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

  return status >= 500 ? 'server-error' : 'unexpected';
}

function requireRecord(payload: unknown, complaint: string): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new TaskProviderError('unexpected', complaint);
  }

  return payload;
}

/** Tolerant, like the rest of this mapping: a malformed value becomes empty rather than throwing. */
function toLabels(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function toProjectId(value: unknown): string {
  const id = typeof value === 'number' ? String(value) : value;

  return typeof id === 'string' ? id : '';
}

/** Unlike `toProjectId`, absence is meaningful here: no parent is not the same as an empty id. */
function toOptionalId(value: unknown): string | undefined {
  const id = typeof value === 'number' ? String(value) : value;

  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function toEpochMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? undefined : parsed;
}

/** The raw description, not the sanitized one, so the footer is read exactly as Todoist stores it. */
function findEmbeddedBlockId(value: unknown): string | undefined {
  return typeof value === 'string' ? findFooterBlockId(value) : undefined;
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
