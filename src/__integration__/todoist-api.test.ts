import { TodoistApiClient } from '../services/todoist/todoist-api-client';
import { FetchHttpClient } from './fetch-http-client';

const INVALID_TOKEN = '0'.repeat(40);
const apiToken = process.env.TODOIST_API_TOKEN ?? '';
const describeAgainstTodoist = apiToken.length > 0 ? describe : describe.skip;

function clientUsing(token: string): TodoistApiClient {
  return new TodoistApiClient(new FetchHttpClient(), () => token);
}

describeAgainstTodoist('Todoist API (set TODOIST_API_TOKEN to run)', () => {
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
