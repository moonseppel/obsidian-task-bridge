import { App } from 'obsidian';
import { TodoistCredentials } from '../../../services/todoist/todoist-credentials';

function credentialsOver(secret: string | null): TodoistCredentials {
  const app = { secretStorage: { getSecret: (): string | null => secret } } as unknown as App;

  return new TodoistCredentials(app, () => Promise.resolve());
}

describe('TodoistCredentials', () => {
  it('starts with nothing selected', () => {
    expect(credentialsOver('a-token').toStored()).toEqual({ apiTokenSecretName: '' });
  });

  it('asks the user for a token while none is selected', () => {
    expect(credentialsOver('a-token').describeWhatIsMissing()).toContain('API token');
  });

  it('is satisfied once a secret is selected', () => {
    const credentials = credentialsOver('a-token');
    credentials.restore({ apiTokenSecretName: 'todoist-token' });

    expect(credentials.describeWhatIsMissing()).toBe('');
  });

  it('reads the token out of the selected secret', () => {
    const credentials = credentialsOver('a-token');
    credentials.restore({ apiTokenSecretName: 'todoist-token' });

    expect(credentials.readToken()).toBe('a-token');
  });

  it.each<[string | null, string]>([
    [null, 'the secret holds no token'],
    ['', 'the secret is empty'],
  ])('reports the token as missing on this device when %s, distinct from never being configured', (secret) => {
    const credentials = credentialsOver(secret);
    credentials.restore({ apiTokenSecretName: 'todoist-token' });

    expect(() => credentials.readToken()).toThrow(
      expect.objectContaining({ failure: 'token-missing-on-device' }),
    );
  });

  it('reports a missing configuration when no secret is selected at all', () => {
    expect(() => credentialsOver('a-token').readToken()).toThrow(
      expect.objectContaining({ failure: 'not-configured' }),
    );
  });

  it.each<[unknown]>([[null], ['not an object'], [{ apiTokenSecretName: 42 }]])(
    'restores nothing from a stored value of %s',
    (stored) => {
      const credentials = credentialsOver('a-token');
      credentials.restore(stored);

      expect(credentials.toStored()).toEqual({ apiTokenSecretName: '' });
    },
  );

  it('trims the surrounding space off a chosen secret name', () => {
    const credentials = credentialsOver('a-token');
    credentials.restore({ apiTokenSecretName: '  todoist-token  ' });

    expect(credentials.toStored()).toEqual({ apiTokenSecretName: 'todoist-token' });
  });
});
