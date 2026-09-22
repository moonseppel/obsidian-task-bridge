import { HttpClient } from '../../../services/http/http-client';
import { TaskProviderError } from '../../../services/task-provider-error';
import { TodoistApiClient } from '../../../services/todoist/todoist-api-client';
import {
  VALID_USER,
  clientReplying,
  respondingWith,
  sentRequest,
} from '../../support/todoist-client-harness';

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

    it('reports a server error for 500', async () => {
      const context = respondingWith(500, { error: 'Internal error' });
      await expect(context.client.fetchUser()).rejects.toMatchObject({ failure: 'server-error' });
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
