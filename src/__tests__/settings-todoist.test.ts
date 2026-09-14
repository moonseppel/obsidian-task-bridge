import { ButtonComponent, SecretComponent, Setting } from 'obsidian';
import { TaskProviderError } from '../services/task-provider-error';
import { TaskBridgeSettingTab } from '../settings';
import {
  makeTab,
  flushPendingWork,
  connectionDesc,
  tokenDescription,
  spySettingNames,
  connectionRow,
} from './support/settings-harness';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TaskBridgeSettingTab Todoist section', () => {
  const ACCOUNT = { id: 'user-1', displayName: 'Jan Pralle' };

  function changeTokenSecret(tab: TaskBridgeSettingTab, secretName: string): Promise<void> {
    const onChange = jest.spyOn(SecretComponent.prototype, 'onChange');
    tab.display();
    onChange.mock.calls[0][0](secretName);

    return flushPendingWork();
  }

  it('groups the provider settings under a heading', () => {
    const names = spySettingNames();
    makeTab('').tab.display();
    expect(names()).toContain('Todoist');
  });

  it('keeps the API token description wording', () => {
    const setDesc = jest.spyOn(Setting.prototype, 'setDesc');
    makeTab('').tab.display();
    expect(tokenDescription(setDesc).textContent).toBe(
      'Kept in Obsidian’s secret storage, not in the plugin settings file. ' +
        'Create a token in Todoist under Settings → Integrations → Developer. ' +
        'The token must be configured separately on every device.',
    );
  });

  it('links "Developer" to the Todoist page that issues tokens', () => {
    const setDesc = jest.spyOn(Setting.prototype, 'setDesc');
    makeTab('').tab.display();
    expect(tokenDescription(setDesc).links).toEqual([
      { text: 'Developer', href: 'https://app.todoist.com/app/settings/integrations/developer' },
    ]);
  });

  it('renders the API token setting', () => {
    const names = spySettingNames();
    makeTab('').tab.display();
    expect(names()).toContain('API token');
  });

  it('renders the connection setting', () => {
    const names = spySettingNames();
    makeTab('').tab.display();
    expect(names()).toContain('Connection');
  });

  it('pre-selects the stored secret', () => {
    const setValue = jest.spyOn(SecretComponent.prototype, 'setValue');
    const { tab, plugin } = makeTab('');
    plugin.credentials.restore({ apiTokenSecretName: 'todoist-api-token' });

    tab.display();

    expect(setValue).toHaveBeenCalledWith('todoist-api-token');
  });

  it('explains that no token is configured yet', async () => {
    const { tab, connection } = makeTab('');

    await connection.connect();
    tab.display();

    expect(connectionDesc(tab)).toContain('No API token configured');
  });

  it('names the connected account once the connection succeeds', async () => {
    const { tab, connection } = makeTab('', [], () => Promise.resolve(ACCOUNT));

    await connection.connect();
    tab.display();

    expect(connectionDesc(tab)).toContain('Jan Pralle');
  });

  it('explains a refused token in the connection row', async () => {
    const { tab, connection } = makeTab('', [], () =>
      Promise.reject(new TaskProviderError('invalid-credentials')),
    );

    await connection.connect();
    tab.display();

    expect(connectionDesc(tab)).toContain('rejected the API token');
  });

  it('marks the connection row when the connection failed', async () => {
    const { tab, connection } = makeTab('', [], () =>
      Promise.reject(new TaskProviderError('invalid-credentials')),
    );

    await connection.connect();
    tab.display();

    expect(connectionRow(tab).hasClass('task-bridge-connection-failed')).toBe(true);
  });

  it('does not mark the connection row while no token is configured', async () => {
    const { tab, connection } = makeTab('');

    await connection.connect();
    tab.display();

    expect(connectionRow(tab).hasClass('task-bridge-connection-failed')).toBe(false);
  });

  it('stores the secret chosen for the API token', async () => {
    const { tab, plugin } = makeTab('');

    await changeTokenSecret(tab, 'todoist-api-token');

    expect(plugin.credentials.toStored()).toEqual({ apiTokenSecretName: 'todoist-api-token' });
  });

  it('persists the choice of secret', async () => {
    const { tab, saveSettings } = makeTab('');

    await changeTokenSecret(tab, 'todoist-api-token');

    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('forgets the secret when the field is cleared, which reports null rather than an empty string', async () => {
    const { tab, plugin } = makeTab('');
    plugin.credentials.restore({ apiTokenSecretName: 'todoist-test' });

    await changeTokenSecret(tab, null as unknown as string);

    expect(plugin.credentials.toStored()).toEqual({ apiTokenSecretName: '' });
  });

  it('re-checks the connection when the field is cleared', async () => {
    const { tab, plugin, connectToTaskProvider } = makeTab('');
    plugin.credentials.restore({ apiTokenSecretName: 'todoist-test' });

    await changeTokenSecret(tab, null as unknown as string);

    expect(connectToTaskProvider).toHaveBeenCalledTimes(1);
  });

  it('forgets the secret when it is deleted from the secret list', async () => {
    const { tab, plugin } = makeTab('');
    plugin.credentials.restore({ apiTokenSecretName: 'todoist-test' });

    await changeTokenSecret(tab, '');

    expect(plugin.credentials.toStored()).toEqual({ apiTokenSecretName: '' });
  });

  it('disables the connection test while no API token is selected', () => {
    const setDisabled = jest.spyOn(ButtonComponent.prototype, 'setDisabled');
    makeTab('').tab.display();
    expect(setDisabled).toHaveBeenCalledWith(true);
  });

  it('says why the connection test is unavailable', () => {
    const setTooltip = jest.spyOn(ButtonComponent.prototype, 'setTooltip');
    makeTab('').tab.display();
    expect(setTooltip).toHaveBeenCalledWith('Select an API token first.');
  });

  it('enables the connection test once a secret is selected', () => {
    const setDisabled = jest.spyOn(ButtonComponent.prototype, 'setDisabled');
    const { tab, plugin } = makeTab('');
    plugin.credentials.restore({ apiTokenSecretName: 'todoist-api-token' });

    tab.display();

    expect(setDisabled).toHaveBeenCalledWith(false);
  });

  it('reconnects when a different secret is chosen', async () => {
    const { tab, connectToTaskProvider } = makeTab('');

    await changeTokenSecret(tab, 'todoist-api-token');

    expect(connectToTaskProvider).toHaveBeenCalledTimes(1);
  });
});
