import { App, ButtonComponent, SearchComponent, SecretComponent, Setting, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianTaskSyncSettingTab } from '../settings';
import type ObsidianTaskSyncPlugin from '../main';
import { ProviderConnection } from '../services/provider-connection';
import { ProviderAccount } from '../services/task-provider';
import { TaskProviderError } from '../services/task-provider-error';

interface TestEl {
  hasClass(cls: string): boolean;
  dispatch(type: string): void;
}

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  return file;
}

interface TabContext {
  tab: ObsidianTaskSyncSettingTab;
  plugin: ObsidianTaskSyncPlugin;
  saveSettings: jest.Mock;
  connectToTaskProvider: jest.Mock;
  connection: ProviderConnection;
  existingPaths: string[];
}

function notConfigured(): Promise<ProviderAccount> {
  return Promise.reject(new TaskProviderError('not-configured'));
}

function makeTab(
  relativeTaskSourceNotePath: string,
  existingPaths: string[] = [],
  connect: () => Promise<ProviderAccount> = notConfigured,
): TabContext {
  const app = {
    vault: {
      getMarkdownFiles: (): TFile[] => existingPaths.map(tfile),
      getAbstractFileByPath: (path: string): TFile | null =>
        existingPaths.includes(path) ? tfile(path) : null,
    },
  } as unknown as App;

  const saveSettings = jest.fn().mockResolvedValue(undefined);
  const connection = new ProviderConnection({ displayName: 'Todoist', connect });
  const connectToTaskProvider = jest.fn().mockImplementation(() => connection.connect());
  const plugin = {
    app,
    settings: { relativeTaskSourceNotePath, todoistApiTokenSecretName: '' },
    saveSettings,
    connection,
    connectToTaskProvider,
  } as unknown as ObsidianTaskSyncPlugin;

  return {
    tab: new ObsidianTaskSyncSettingTab(app, plugin),
    plugin,
    saveSettings,
    connectToTaskProvider,
    connection,
    existingPaths,
  };
}

function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function spySettingNames(): () => string[] {
  const spy = jest.spyOn(Setting.prototype, 'setName');
  return () => spy.mock.calls.map((call) => String(call[0]));
}

function sourceDesc(tab: ObsidianTaskSyncSettingTab): string {
  return (tab as unknown as { sourceSetting: { description: string } }).sourceSetting.description;
}

function connectionDesc(tab: ObsidianTaskSyncSettingTab): string {
  return (tab as unknown as { connectionSetting: { description: string } }).connectionSetting.description;
}

function isSourceNoteMissing(tab: ObsidianTaskSyncSettingTab): boolean {
  return (tab as unknown as { isSourceNoteMissing(): boolean }).isSourceNoteMissing();
}

function settingRow(tab: ObsidianTaskSyncSettingTab): TestEl {
  return (tab as unknown as { sourceSetting: { settingEl: TestEl } }).sourceSetting.settingEl;
}

function sourceInput(tab: ObsidianTaskSyncSettingTab): TestEl {
  return (tab as unknown as { sourceInputEl: TestEl }).sourceInputEl;
}

function connectionRow(tab: ObsidianTaskSyncSettingTab): TestEl {
  return (tab as unknown as { connectionSetting: { settingEl: TestEl } }).connectionSetting.settingEl;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DEFAULT_SETTINGS', () => {
  it('has an empty source note path', () => {
    expect(DEFAULT_SETTINGS.relativeTaskSourceNotePath).toBe('');
  });

  it('has no API token secret selected', () => {
    expect(DEFAULT_SETTINGS.todoistApiTokenSecretName).toBe('');
  });
});

describe('ObsidianTaskSyncSettingTab', () => {
  it('renders the task source note setting', () => {
    const names = spySettingNames();
    makeTab('').tab.display();
    expect(names()).toContain('Task source note');
  });

  it('pre-fills the field with the configured source note path', () => {
    const setValue = jest.spyOn(SearchComponent.prototype, 'setValue');
    makeTab('projects/Tasks.md').tab.display();
    expect(setValue).toHaveBeenCalledWith('projects/Tasks.md');
  });

  it('reports a missing note when the configured path does not resolve', () => {
    expect(isSourceNoteMissing(makeTab('missing/Note.md').tab)).toBe(true);
  });

  it('does not report a missing note when the configured note exists', () => {
    expect(isSourceNoteMissing(makeTab('Tasks.md', ['Tasks.md']).tab)).toBe(false);
  });

  it('does not report a missing note when nothing is configured', () => {
    expect(isSourceNoteMissing(makeTab('').tab)).toBe(false);
  });

  it('shows the not-found message in the field description when the note is missing', () => {
    const { tab } = makeTab('missing/Note.md');
    tab.display();
    expect(sourceDesc(tab)).toContain('not found');
  });

  it('marks the setting row when the configured note is missing', () => {
    const { tab } = makeTab('missing/Note.md');
    tab.display();
    expect(settingRow(tab).hasClass('obsidian-task-sync-source-missing')).toBe(true);
  });

  it('does not mark the setting row when the configured note exists', () => {
    const { tab } = makeTab('Tasks.md', ['Tasks.md']);
    tab.display();
    expect(settingRow(tab).hasClass('obsidian-task-sync-source-missing')).toBe(false);
  });

  it('re-evaluates the warning when the field loses focus', () => {
    const { tab, existingPaths } = makeTab('Tasks.md', []);
    tab.display();
    expect(sourceDesc(tab)).toContain('not found');

    existingPaths.push('Tasks.md');
    sourceInput(tab).dispatch('blur');

    expect(sourceDesc(tab)).not.toContain('not found');
  });

  it('clears the row marker on blur once the note exists', () => {
    const { tab, existingPaths } = makeTab('Tasks.md', []);
    tab.display();

    existingPaths.push('Tasks.md');
    sourceInput(tab).dispatch('blur');

    expect(settingRow(tab).hasClass('obsidian-task-sync-source-missing')).toBe(false);
  });

  it('updates the stored path when a new note is entered in the field', async () => {
    const onChange = jest.spyOn(SearchComponent.prototype, 'onChange');
    const { tab, plugin } = makeTab('');
    tab.display();

    await onChange.mock.calls[0][0]('Notes/Tasks.md');

    expect(plugin.settings.relativeTaskSourceNotePath).toBe('Notes/Tasks.md');
  });

  it('saves settings when a new note is entered in the field', async () => {
    const onChange = jest.spyOn(SearchComponent.prototype, 'onChange');
    const { tab, saveSettings } = makeTab('');
    tab.display();

    await onChange.mock.calls[0][0]('Notes/Tasks.md');

    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});

describe('ObsidianTaskSyncSettingTab Todoist section', () => {
  const ACCOUNT = { id: 'user-1', displayName: 'Jan Pralle' };

  function changeTokenSecret(tab: ObsidianTaskSyncSettingTab, secretName: string): Promise<void> {
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
    plugin.settings.todoistApiTokenSecretName = 'todoist-api-token';

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

    expect(connectionRow(tab).hasClass('obsidian-task-sync-connection-failed')).toBe(true);
  });

  it('does not mark the connection row while no token is configured', async () => {
    const { tab, connection } = makeTab('');

    await connection.connect();
    tab.display();

    expect(connectionRow(tab).hasClass('obsidian-task-sync-connection-failed')).toBe(false);
  });

  it('stores the secret chosen for the API token', async () => {
    const { tab, plugin } = makeTab('');

    await changeTokenSecret(tab, 'todoist-api-token');

    expect(plugin.settings.todoistApiTokenSecretName).toBe('todoist-api-token');
  });

  it('persists the choice of secret', async () => {
    const { tab, saveSettings } = makeTab('');

    await changeTokenSecret(tab, 'todoist-api-token');

    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('forgets the secret when the field is cleared, which reports null rather than an empty string', async () => {
    const { tab, plugin } = makeTab('');
    plugin.settings.todoistApiTokenSecretName = 'todoist-test';

    await changeTokenSecret(tab, null as unknown as string);

    expect(plugin.settings.todoistApiTokenSecretName).toBe('');
  });

  it('re-checks the connection when the field is cleared', async () => {
    const { tab, plugin, connectToTaskProvider } = makeTab('');
    plugin.settings.todoistApiTokenSecretName = 'todoist-test';

    await changeTokenSecret(tab, null as unknown as string);

    expect(connectToTaskProvider).toHaveBeenCalledTimes(1);
  });

  it('forgets the secret when it is deleted from the secret list', async () => {
    const { tab, plugin } = makeTab('');
    plugin.settings.todoistApiTokenSecretName = 'todoist-test';

    await changeTokenSecret(tab, '');

    expect(plugin.settings.todoistApiTokenSecretName).toBe('');
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
    plugin.settings.todoistApiTokenSecretName = 'todoist-api-token';

    tab.display();

    expect(setDisabled).toHaveBeenCalledWith(false);
  });

  it('reconnects when a different secret is chosen', async () => {
    const { tab, connectToTaskProvider } = makeTab('');

    await changeTokenSecret(tab, 'todoist-api-token');

    expect(connectToTaskProvider).toHaveBeenCalledTimes(1);
  });
});
