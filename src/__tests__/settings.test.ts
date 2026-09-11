import {
  App,
  ButtonComponent,
  SearchComponent,
  SecretComponent,
  Setting,
  TFile,
  ToggleComponent,
} from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianTaskSyncSettingTab } from '../settings';
import { MAX_SYNC_INTERVAL_MINUTES, MIN_SYNC_INTERVAL_MINUTES } from '../utils/sync-interval';
import type ObsidianTaskSyncPlugin from '../main';
import { ProviderConnection } from '../services/provider-connection';
import { stubProvider } from './support/stub-provider';
import { ProviderAccount, ProviderProject } from '../services/task-provider';
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
  restartSyncSchedule: jest.Mock;
  applyDebugMode: jest.Mock;
  refreshKnownProjects: jest.Mock;
  ensureProjectSelected: jest.Mock;
  knownProjects: ProviderProject[];
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
  const connection = new ProviderConnection(stubProvider({ connect }));
  const connectToTaskProvider = jest.fn().mockImplementation(() => connection.connect());
  const restartSyncSchedule = jest.fn();
  const applyDebugMode = jest.fn();
  const refreshKnownProjects = jest.fn().mockResolvedValue(undefined);
  const ensureProjectSelected = jest.fn().mockResolvedValue(undefined);
  const knownProjects: ProviderProject[] = [];
  const plugin = {
    app,
    settings: { ...DEFAULT_SETTINGS, relativeTaskSourceNotePath },
    saveSettings,
    connection,
    connectToTaskProvider,
    restartSyncSchedule,
    applyDebugMode,
    refreshKnownProjects,
    ensureProjectSelected,
    knownProjects,
  } as unknown as ObsidianTaskSyncPlugin;

  return {
    tab: new ObsidianTaskSyncSettingTab(app, plugin),
    plugin,
    saveSettings,
    connectToTaskProvider,
    connection,
    existingPaths,
    restartSyncSchedule,
    applyDebugMode,
    refreshKnownProjects,
    ensureProjectSelected,
    knownProjects,
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

interface TestFragment {
  textContent: string;
  links: Array<{ text: string; href: string }>;
}

function tokenDescription(setDesc: jest.SpyInstance): TestFragment {
  const fragment = setDesc.mock.calls
    .map((call) => call[0] as unknown)
    .find((value) => typeof value !== 'string');

  return fragment as TestFragment;
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

  it('keeps the API token description wording', () => {
    const setDesc = jest.spyOn(Setting.prototype, 'setDesc');
    makeTab('').tab.display();
    expect(tokenDescription(setDesc).textContent).toBe(
      'Kept in Obsidian’s secret storage, not in the plugin settings file. ' +
        'Create a token in Todoist under Settings → Integrations → Developer. ' +
        'The token must be configured on every devices used separately.',
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

describe('ObsidianTaskSyncSettingTab sync section', () => {
  it('offers a project row and a sync interval row', () => {
    const names = spySettingNames();
    makeTab('').tab.display();

    expect(names()).toEqual(expect.arrayContaining(['Project', 'Sync', 'Check for changes every']));
  });

  it('says that the project defaults to the Inbox', () => {
    const setDesc = jest.spyOn(Setting.prototype, 'setDesc');
    makeTab('').tab.display();

    expect(setDesc.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([expect.stringContaining('Defaults to the Inbox')]),
    );
  });

  it('offers the Inbox as the placeholder before a project has been stored', () => {
    const setPlaceholder = jest.spyOn(SearchComponent.prototype, 'setPlaceholder');
    makeTab('').tab.display();

    expect(setPlaceholder.mock.calls.map((call) => String(call[0]))).toContain('Inbox');
  });

  it('gives the project field no change handler, so it can never be emptied', () => {
    const { tab, plugin, saveSettings } = makeTab('');
    plugin.settings.todoistProjectId = 'p1';
    plugin.settings.todoistProjectName = 'Errands';

    tab.display();

    expect(saveSettings).not.toHaveBeenCalled();
    expect(plugin.settings.todoistProjectId).toBe('p1');
  });

  it('shows the stored project name once one is chosen', () => {
    const { tab, plugin } = makeTab('');
    plugin.settings.todoistProjectId = 'p1';
    plugin.settings.todoistProjectName = 'Errands';
    const setValue = jest.spyOn(SearchComponent.prototype, 'setValue');

    tab.display();

    expect(setValue.mock.calls.map((call) => String(call[0]))).toContain('Errands');
  });

  it('stores both the id and the name when a project is picked', async () => {
    const { tab, plugin, saveSettings } = makeTab('');
    tab.display();

    await (tab as unknown as {
      handleProjectSelection(project: { id: string; name: string }): Promise<void>;
    }).handleProjectSelection({ id: 'p1', name: 'Errands' });

    expect(plugin.settings.todoistProjectId).toBe('p1');
    expect(plugin.settings.todoistProjectName).toBe('Errands');
    expect(saveSettings).toHaveBeenCalled();
  });

  it('reschedules the poll when the interval changes', async () => {
    const { tab, plugin, restartSyncSchedule } = makeTab('');
    tab.display();

    await saveInterval(tab, '15');

    expect(plugin.settings.syncIntervalMinutes).toBe(15);
    expect(restartSyncSchedule).toHaveBeenCalledTimes(1);
  });

  it('does not reschedule when the typed interval is unchanged', async () => {
    const { tab, plugin, restartSyncSchedule } = makeTab('');
    tab.display();

    await saveInterval(tab, String(plugin.settings.syncIntervalMinutes));

    expect(restartSyncSchedule).not.toHaveBeenCalled();
  });

  it.each([
    ['0', MIN_SYNC_INTERVAL_MINUTES],
    ['-5', MIN_SYNC_INTERVAL_MINUTES],
    ['99999', MAX_SYNC_INTERVAL_MINUTES],
    ['7.6', 8],
  ])('clamps a typed interval of %s to %s', async (typed, expected) => {
    const { tab, plugin } = makeTab('');
    tab.display();

    await saveInterval(tab, typed);

    expect(plugin.settings.syncIntervalMinutes).toBe(expected);
  });

  it.each(['soon', '', '   '])('keeps the previous interval when the field reads %s', async (typed) => {
    const { tab, plugin } = makeTab('');
    tab.display();

    await saveInterval(tab, typed);

    expect(plugin.settings.syncIntervalMinutes).toBe(DEFAULT_SETTINGS.syncIntervalMinutes);
  });
});

function saveInterval(tab: ObsidianTaskSyncSettingTab, value: string): Promise<void> {
  return (tab as unknown as { saveSyncInterval(value: string): Promise<void> }).saveSyncInterval(value);
}

describe('ObsidianTaskSyncSettingTab debug section', () => {
  it('offers a debug mode row', () => {
    const names = spySettingNames();
    makeTab('').tab.display();

    expect(names()).toContain('Debug mode');
  });

  it('gives the debug row a description', () => {
    const setDesc = jest.spyOn(Setting.prototype, 'setDesc');
    makeTab('').tab.display();

    expect(setDesc.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([expect.stringContaining('diagnosing')]),
    );
  });

  it('shows the stored choice in the toggle', () => {
    const { tab, plugin } = makeTab('');
    plugin.settings.debugMode = true;
    const setValue = jest.spyOn(ToggleComponent.prototype, 'setValue');

    tab.display();

    expect(setValue).toHaveBeenCalledWith(true);
  });

  it('persists the change', async () => {
    const { tab, plugin, saveSettings } = makeTab('');
    tab.display();

    await (tab as unknown as { saveDebugMode(enabled: boolean): Promise<void> }).saveDebugMode(true);

    expect(saveSettings).toHaveBeenCalledWith();
    expect(plugin.settings.debugMode).toBe(true);
  });

  it('applies the change without waiting for a restart', async () => {
    const { tab, applyDebugMode } = makeTab('');
    tab.display();

    await (tab as unknown as { saveDebugMode(enabled: boolean): Promise<void> }).saveDebugMode(true);

    expect(applyDebugMode).toHaveBeenCalledTimes(1);
  });
});

describe('ObsidianTaskSyncSettingTab project list', () => {
  it('refreshes the remembered projects when the settings are opened', async () => {
    const { tab, refreshKnownProjects } = makeTab('');

    tab.display();
    await flushPendingWork();

    expect(refreshKnownProjects).toHaveBeenCalledTimes(1);
  });

  it('does not refresh again while the settings stay open', async () => {
    const { tab, refreshKnownProjects } = makeTab('');

    tab.display();
    await flushPendingWork();
    tab.display();
    tab.display();
    await flushPendingWork();

    expect(refreshKnownProjects).toHaveBeenCalledTimes(1);
  });

  it('refreshes again the next time the settings are opened', async () => {
    const { tab, refreshKnownProjects } = makeTab('');

    tab.display();
    await flushPendingWork();
    tab.hide();
    tab.display();
    await flushPendingWork();

    expect(refreshKnownProjects).toHaveBeenCalledTimes(2);
  });

  it('refreshes when a different API token is chosen', async () => {
    const { tab, refreshKnownProjects } = makeTab('');
    tab.display();
    await flushPendingWork();
    refreshKnownProjects.mockClear();

    await (tab as unknown as {
      handleApiTokenSecretChange(secretName: unknown): Promise<void>;
    }).handleApiTokenSecretChange('another-token');

    expect(refreshKnownProjects).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the connection is tested', async () => {
    const { tab, refreshKnownProjects } = makeTab('');
    tab.display();
    await flushPendingWork();
    refreshKnownProjects.mockClear();

    await (tab as unknown as { handleTestConnection(): Promise<void> }).handleTestConnection();

    expect(refreshKnownProjects).toHaveBeenCalledTimes(1);
  });
});

describe('ObsidianTaskSyncSettingTab choosing a default project', () => {
  it('picks a project as soon as a token is entered, without waiting for a restart', async () => {
    const { tab, ensureProjectSelected } = makeTab('');

    await (tab as unknown as {
      handleApiTokenSecretChange(secretName: unknown): Promise<void>;
    }).handleApiTokenSecretChange('todoist-token');

    expect(ensureProjectSelected).toHaveBeenCalledTimes(1);
  });

  it('refreshes the list before choosing, so the same list is not fetched twice', async () => {
    const { tab, refreshKnownProjects, ensureProjectSelected } = makeTab('');

    await (tab as unknown as {
      handleApiTokenSecretChange(secretName: unknown): Promise<void>;
    }).handleApiTokenSecretChange('todoist-token');

    expect(refreshKnownProjects.mock.invocationCallOrder[0]).toBeLessThan(
      ensureProjectSelected.mock.invocationCallOrder[0],
    );
  });

  it('also picks a project after the connection is tested', async () => {
    const { tab, ensureProjectSelected } = makeTab('');

    await (tab as unknown as { handleTestConnection(): Promise<void> }).handleTestConnection();

    expect(ensureProjectSelected).toHaveBeenCalledTimes(1);
  });
});
