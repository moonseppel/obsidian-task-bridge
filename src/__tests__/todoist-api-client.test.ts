import { HttpClient, HttpRequest, HttpResponse } from '../services/http/http-client';
import { TaskProviderError } from '../services/task-provider-error';
import { TodoistApiClient } from '../services/todoist/todoist-api-client';

const VALID_USER = { id: '2671355', full_name: 'Jan Pralle', email: 'jan@example.com' };

interface ClientContext {
  client: TodoistApiClient;
  send: jest.Mock<Promise<HttpResponse>, [HttpRequest]>;
}

function clientReplying(
  reply: (request: HttpRequest) => Promise<HttpResponse>,
  token = 'test-token',
): ClientContext {
  const send = jest.fn(reply);
  const http: HttpClient = { send };

  return { client: new TodoistApiClient(http, () => token), send };
}

function respondingWith(status: number, body: unknown): ClientContext {
  return clientReplying(() => Promise.resolve({ status, text: JSON.stringify(body) }));
}

function sentRequest(context: ClientContext): HttpRequest {
  return context.send.mock.calls[0][0];
}

describe('TodoistApiClient', () => {
  describe('Request shape', () => {
    it('asks the Todoist v1 user endpoint for the account', async () => {
      const context = respondingWith(200, VALID_USER);
      await context.client.fetchUser();
      expect(sentRequest(context).url).toBe('https://api.todoist.com/api/v1/user');
    });

    it('authorizes the request with the current token as a bearer token', async () => {
      const context = respondingWith(200, VALID_USER);
      await context.client.fetchUser();
      expect(sentRequest(context).headers.Authorization).toBe('Bearer test-token');
    });

    it('reads the token for every request so a changed token takes effect immediately', async () => {
      let token = 'first-token';
      const context = clientReplying(() => Promise.resolve({ status: 200, text: JSON.stringify(VALID_USER) }));
      const client = new TodoistApiClient({ send: context.send }, () => token);

      await client.fetchUser();
      token = 'second-token';
      await client.fetchUser();

      expect(context.send.mock.calls[1][0].headers.Authorization).toBe('Bearer second-token');
    });
  });

  describe('Successful response', () => {
    it('returns the account id', async () => {
      await expect(respondingWith(200, VALID_USER).client.fetchUser()).resolves.toMatchObject({ id: '2671355' });
    });

    it('returns the full name', async () => {
      await expect(respondingWith(200, VALID_USER).client.fetchUser()).resolves.toMatchObject({
        fullName: 'Jan Pralle',
      });
    });

    it('accepts a numeric id, which older Todoist responses used', async () => {
      const context = respondingWith(200, { ...VALID_USER, id: 2671355 });
      await expect(context.client.fetchUser()).resolves.toMatchObject({ id: '2671355' });
    });

    it('tolerates a missing full name', async () => {
      const context = respondingWith(200, { id: '1', email: 'jan@example.com' });
      await expect(context.client.fetchUser()).resolves.toMatchObject({ fullName: '' });
    });
  });

  describe('Failure mapping', () => {
    it('reports a rejected token for 401', async () => {
      const context = respondingWith(401, { error: 'Unauthorized' });
      await expect(context.client.fetchUser()).rejects.toMatchObject({ failure: 'invalid-credentials' });
    });

    it('reports a rejected token for 403', async () => {
      const context = respondingWith(403, { error: 'Forbidden' });
      await expect(context.client.fetchUser()).rejects.toMatchObject({ failure: 'invalid-credentials' });
    });

    it('reports rate limiting for 429', async () => {
      const context = respondingWith(429, { error: 'Too many requests' });
      await expect(context.client.fetchUser()).rejects.toMatchObject({ failure: 'rate-limited' });
    });

    it('reports an unreachable service for 500', async () => {
      const context = respondingWith(500, { error: 'Internal error' });
      await expect(context.client.fetchUser()).rejects.toMatchObject({ failure: 'unreachable' });
    });

    it('reports an unexpected response for other error statuses', async () => {
      const context = respondingWith(418, { error: 'I am a teapot' });
      await expect(context.client.fetchUser()).rejects.toMatchObject({ failure: 'unexpected' });
    });

    it('reports an unreachable service when the request never completes', async () => {
      const context = clientReplying(() => Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED')));
      await expect(context.client.fetchUser()).rejects.toMatchObject({ failure: 'unreachable' });
    });

    it('reports an unexpected response when the body is not JSON', async () => {
      const context = clientReplying(() => Promise.resolve({ status: 200, text: '<html>oops</html>' }));
      await expect(context.client.fetchUser()).rejects.toMatchObject({ failure: 'unexpected' });
    });

    it('reports an unexpected response when the user has no id', async () => {
      const context = respondingWith(200, { email: 'jan@example.com' });
      await expect(context.client.fetchUser()).rejects.toMatchObject({ failure: 'unexpected' });
    });

    it('passes a missing token through untouched', async () => {
      const http: HttpClient = { send: () => Promise.reject(new Error('should not be called')) };
      const client = new TodoistApiClient(http, () => {
        throw new TaskProviderError('not-configured');
      });

      await expect(client.fetchUser()).rejects.toMatchObject({ failure: 'not-configured' });
    });

    it('quotes the API error text in the message', async () => {
      const context = respondingWith(401, { error: 'Unauthorized' });
      await expect(context.client.fetchUser()).rejects.toThrow('Unauthorized');
    });
  });
});

describe('TodoistApiClient tasks and projects', () => {
  function page(results: unknown[], nextCursor: string | null = null): HttpResponse {
    return { status: 200, text: JSON.stringify({ results, next_cursor: nextCursor }) };
  }

  describe('listProjects', () => {
    it('reads the project list from the v1 projects endpoint', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 'p1', name: 'Errands', inbox_project: false }])),
      );

      await expect(context.client.listProjects()).resolves.toEqual([
        { id: 'p1', name: 'Errands', isInbox: false },
      ]);
      expect(sentRequest(context).url).toContain('https://api.todoist.com/api/v1/projects?');
    });

    it('marks the Inbox, which is what the plugin falls back to', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 'p1', name: 'Inbox', inbox_project: true }])),
      );

      await expect(context.client.listProjects()).resolves.toEqual([
        { id: 'p1', name: 'Inbox', isInbox: true },
      ]);
    });

    it('treats a project with no inbox flag as an ordinary one', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 'p1', name: 'Errands' }])));

      await expect(context.client.listProjects()).resolves.toEqual([
        { id: 'p1', name: 'Errands', isInbox: false },
      ]);
    });

    it('rejects a project entry with no id rather than syncing into nowhere', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ name: 'Nameless' }])));

      await expect(context.client.listProjects()).rejects.toBeInstanceOf(TaskProviderError);
    });
  });

  describe('listTasks', () => {
    it('scopes the request to the requested project', async () => {
      const context = clientReplying(() => Promise.resolve(page([])));
      await context.client.listTasks('p1');

      expect(sentRequest(context).url).toContain('project_id=p1');
    });

    it('follows next_cursor until the list is exhausted', async () => {
      const pages = [
        page([{ id: 't1', content: 'One' }], 'cursor-2'),
        page([{ id: 't2', content: 'Two' }]),
      ];
      const context = clientReplying(() => Promise.resolve(pages.shift() as HttpResponse));

      await expect(context.client.listTasks('p1')).resolves.toEqual([
        { id: 't1', content: 'One' },
        { id: 't2', content: 'Two' },
      ]);
      expect(context.send.mock.calls[1][0].url).toContain('cursor=cursor-2');
    });

    // Todoist answers an unknown project with an empty list, so absence cannot be detected here.
    // TitleSync tells an empty project from a deleted one by checking the project list instead.
    it('returns nothing for a project with no tasks', async () => {
      const context = clientReplying(() => Promise.resolve(page([])));

      await expect(context.client.listTasks('p1')).resolves.toEqual([]);
    });

    it('strips a line break out of a title so it cannot split a markdown line', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 't1', content: 'One\nTwo' }])));

      await expect(context.client.listTasks('p1')).resolves.toEqual([{ id: 't1', content: 'One Two' }]);
    });

    it('gives up if the server never stops handing back a cursor', async () => {
      const context = clientReplying(() => Promise.resolve(page([], 'always-more')));

      await expect(context.client.listTasks('p1')).rejects.toMatchObject({ failure: 'unexpected' });
    });
  });

  describe('createTask', () => {
    it('posts the title and project as a JSON body', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await expect(context.client.createTask('Buy milk', 'p1')).resolves.toEqual({
        id: 't1',
        content: 'Buy milk',
      });

      const request = sentRequest(context);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.todoist.com/api/v1/tasks');
      expect(request.contentType).toBe('application/json');
      expect(JSON.parse(request.body ?? '')).toEqual({ content: 'Buy milk', project_id: 'p1' });
    });

    it('reports a deleted project rather than a puzzling error', async () => {
      const context = clientReplying(() => Promise.resolve({ status: 404, text: '{}' }));

      await expect(context.client.createTask('Buy milk', 'p1')).rejects.toMatchObject({
        failure: 'project-missing',
      });
    });
  });

  describe('updateTaskContent', () => {
    it('posts the new title to the task endpoint', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy oat milk' }) }),
      );

      await context.client.updateTaskContent('t1', 'Buy oat milk');

      const request = sentRequest(context);
      expect(request.url).toBe('https://api.todoist.com/api/v1/tasks/t1');
      expect(JSON.parse(request.body ?? '')).toEqual({ content: 'Buy oat milk' });
    });

    it('escapes a task id so it cannot reshape the request path', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 'x', content: 'x' }) }),
      );

      await context.client.updateTaskContent('../projects/p1', 'Nice try');

      expect(sentRequest(context).url).toBe(
        'https://api.todoist.com/api/v1/tasks/..%2Fprojects%2Fp1',
      );
    });

    it.each([
      [401, 'invalid-credentials'],
      [429, 'rate-limited'],
      [500, 'unreachable'],
      [418, 'unexpected'],
    ])('maps status %s to the %s failure', async (status, failure) => {
      const context = clientReplying(() => Promise.resolve({ status, text: '{}' }));

      await expect(context.client.updateTaskContent('t1', 'x')).rejects.toMatchObject({ failure });
    });
  });

  describe('deleteTask', () => {
    it('accepts the empty body Todoist returns for a delete', async () => {
      const context = clientReplying(() => Promise.resolve({ status: 204, text: '' }));

      await expect(context.client.deleteTask('t1')).resolves.toBeUndefined();
      expect(sentRequest(context).method).toBe('DELETE');
    });
  });
});
