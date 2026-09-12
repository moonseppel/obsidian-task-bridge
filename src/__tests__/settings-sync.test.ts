import { SearchComponent, Setting, ToggleComponent } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianTaskSyncSettingTab } from '../settings';
import { MAX_SYNC_INTERVAL_MINUTES, MIN_SYNC_INTERVAL_MINUTES } from '../utils/sync-interval';
import {
  makeTab,
  spySettingNames,
} from './support/settings-harness';

afterEach(() => {
  jest.restoreAllMocks();
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
    plugin.settings.projectId = 'p1';
    plugin.settings.projectName = 'Errands';

    tab.display();

    expect(saveSettings).not.toHaveBeenCalled();
    expect(plugin.settings.projectId).toBe('p1');
  });

  it('shows the stored project name once one is chosen', () => {
    const { tab, plugin } = makeTab('');
    plugin.settings.projectId = 'p1';
    plugin.settings.projectName = 'Errands';
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

    expect(plugin.settings.projectId).toBe('p1');
    expect(plugin.settings.projectName).toBe('Errands');
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
