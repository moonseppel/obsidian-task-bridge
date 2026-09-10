import { ProviderConnection } from '../services/provider-connection';
import { ProviderAccount } from '../services/task-provider';
import { TaskProviderError, TaskProviderFailure } from '../services/task-provider-error';
import { stubProvider } from './support/stub-provider';

const ACCOUNT: ProviderAccount = { id: 'user-1', displayName: 'Jan Pralle' };

function connectionTo(connect: () => Promise<ProviderAccount>): ProviderConnection {
  return new ProviderConnection(stubProvider({ connect }));
}

function failingWith(failure: TaskProviderFailure): ProviderConnection {
  return connectionTo(() => Promise.reject(new TaskProviderError(failure)));
}

describe('ProviderConnection', () => {
  it('starts out unconnected', () => {
    expect(connectionTo(() => Promise.resolve(ACCOUNT)).status).toEqual({ state: 'idle' });
  });

  it('exposes the provider name for the settings UI', () => {
    expect(connectionTo(() => Promise.resolve(ACCOUNT)).providerName).toBe('Todoist');
  });

  it('reports the account after a successful connection', async () => {
    await expect(connectionTo(() => Promise.resolve(ACCOUNT)).connect()).resolves.toEqual({
      state: 'connected',
      account: ACCOUNT,
    });
  });

  it('remembers the status of the last attempt', async () => {
    const connection = connectionTo(() => Promise.resolve(ACCOUNT));
    await connection.connect();
    expect(connection.status).toMatchObject({ state: 'connected' });
  });

  it('treats a missing token as an unconfigured connection rather than a failure', async () => {
    await expect(failingWith('not-configured').connect()).resolves.toEqual({ state: 'not-configured' });
  });

  it('reports a rejected token as a failure', async () => {
    await expect(failingWith('invalid-credentials').connect()).resolves.toMatchObject({
      state: 'failed',
      failure: 'invalid-credentials',
    });
  });

  it('carries the explanation of a failure', async () => {
    const status = await failingWith('rate-limited').connect();
    expect(status).toMatchObject({ message: expect.stringContaining('too many requests') });
  });

  it('survives a provider that throws something other than a provider error', async () => {
    const connection = connectionTo(() => Promise.reject(new TypeError('undefined is not a function')));
    await expect(connection.connect()).resolves.toMatchObject({ state: 'failed', failure: 'unexpected' });
  });

  it('ignores a second attempt while one is still in flight', async () => {
    const connection = connectionTo(() => new Promise<ProviderAccount>(() => undefined));

    void connection.connect();

    await expect(connection.connect()).resolves.toEqual({ state: 'connecting' });
  });
});
