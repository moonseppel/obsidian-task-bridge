import { HttpClient, HttpRequest, HttpResponse } from '../../services/http/http-client';
import { TodoistApiClient } from '../../services/todoist/todoist-api-client';

export const VALID_USER = { id: '2671355', full_name: 'Jan Pralle', email: 'jan@example.com' };

export interface ClientContext {
  client: TodoistApiClient;
  send: jest.Mock<Promise<HttpResponse>, [HttpRequest]>;
}

export function clientReplying(
  reply: (request: HttpRequest) => Promise<HttpResponse>,
  token = 'test-token',
): ClientContext {
  const send = jest.fn(reply);
  const http: HttpClient = { send };

  return { client: new TodoistApiClient(http, () => token), send };
}

export function respondingWith(status: number, body: unknown): ClientContext {
  return clientReplying(() => Promise.resolve({ status, text: JSON.stringify(body) }));
}

export function sentRequest(context: ClientContext): HttpRequest {
  return context.send.mock.calls[0][0];
}

/** One page of a Todoist list response; a null cursor marks the last page. */
export function page(results: unknown[], nextCursor: string | null = null): HttpResponse {
  return { status: 200, text: JSON.stringify({ results, next_cursor: nextCursor }) };
}
