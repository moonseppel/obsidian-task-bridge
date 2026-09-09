import { TodoistApiClient } from '../services/todoist/todoist-api-client';
import { FetchHttpClient } from './fetch-http-client';

const INVALID_TOKEN = '0'.repeat(40);
// Guaranteed to be present: jest.integration.setup.js fails the run without it.
const apiToken = process.env.OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN ?? '';

function clientUsing(token: string): TodoistApiClient {
  return new TodoistApiClient(new FetchHttpClient(), () => token);
}

describe('Todoist API', () => {
  it('still answers the user endpoint with an account id', async () => {
    await expect(clientUsing(apiToken).fetchUser()).resolves.toMatchObject({
      id: expect.stringMatching(/\S/) as unknown as string,
    });
  });

  it('still rejects an unknown token as invalid credentials', async () => {
    await expect(clientUsing(INVALID_TOKEN).fetchUser()).rejects.toMatchObject({
      failure: 'invalid-credentials',
    });
  });
});
