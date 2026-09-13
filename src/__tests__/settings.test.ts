import { SearchComponent, ToggleComponent } from 'obsidian';
import { DEFAULT_SETTINGS } from '../settings';
import {
  makeTab,
  locationDesc,
  isSourceLocationMissing,
  settingRow,
  locationInput,
  ignoreDesc,
  ignoreRow,
  saveIgnorePatterns,
  spySettingNames,
} from './support/settings-harness';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DEFAULT_SETTINGS', () => {
  it('has an empty source path', () => {
    expect(DEFAULT_SETTINGS.relativeTaskSourcePath).toBe('');
  });

  it('has the whole-vault toggle off', () => {
    expect(DEFAULT_SETTINGS.syncWholeVault).toBe(false);
  });

  it('has no tag or ignore pattern configured', () => {
    expect(DEFAULT_SETTINGS.sourceTag).toBe('');
    expect(DEFAULT_SETTINGS.ignoreFilePatterns).toBe('');
  });
});

describe('ObsidianTaskSyncSettingTab source settings', () => {
  it('renders the whole-vault, note-or-folder, tag and ignore-pattern rows in order', () => {
    const names = spySettingNames();
    makeTab('').tab.display();

    const order = names();
    expect(order.indexOf('Sync the whole vault')).toBeLessThan(order.indexOf('Note or folder'));
    expect(order.indexOf('Note or folder')).toBeLessThan(order.indexOf('Tag'));
    expect(order.indexOf('Tag')).toBeLessThan(order.indexOf('Ignore file patterns'));
  });

  it('pre-fills the location field with the configured path', () => {
    const setValue = jest.spyOn(SearchComponent.prototype, 'setValue');
    makeTab('projects/Tasks.md').tab.display();
    expect(setValue).toHaveBeenCalledWith('projects/Tasks.md');
  });

  it('reports a missing location when the configured path does not resolve', () => {
    expect(isSourceLocationMissing(makeTab('missing/Note.md').tab)).toBe(true);
  });

  it('does not report a missing location when the configured note exists', () => {
    expect(isSourceLocationMissing(makeTab('Tasks.md', ['Tasks.md']).tab)).toBe(false);
  });

  it('does not report a missing location when nothing is configured', () => {
    expect(isSourceLocationMissing(makeTab('').tab)).toBe(false);
  });

  it('suppresses the missing-location warning while the whole-vault toggle is on', () => {
    const { tab, plugin } = makeTab('missing/Note.md');
    plugin.settings.syncWholeVault = true;

    tab.display();

    expect(locationDesc(tab)).not.toContain('not found');
  });

  it('shows the not-found message in the field description when the location is missing', () => {
    const { tab } = makeTab('missing/Note.md');
    tab.display();
    expect(locationDesc(tab)).toContain('not found');
  });

  it('marks the setting row when the configured location is missing', () => {
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
    expect(locationDesc(tab)).toContain('not found');

    existingPaths.push('Tasks.md');
    locationInput(tab).dispatch('blur');

    expect(locationDesc(tab)).not.toContain('not found');
  });

  it('clears the row marker on blur once the note exists', () => {
    const { tab, existingPaths } = makeTab('Tasks.md', []);
    tab.display();

    existingPaths.push('Tasks.md');
    locationInput(tab).dispatch('blur');

    expect(settingRow(tab).hasClass('obsidian-task-sync-source-missing')).toBe(false);
  });

  it('updates the stored path when a new note is entered in the field', async () => {
    const onChange = jest.spyOn(SearchComponent.prototype, 'onChange');
    const { tab, plugin } = makeTab('');
    tab.display();

    await onChange.mock.calls[0][0]('Notes/Tasks.md');

    expect(plugin.settings.relativeTaskSourcePath).toBe('Notes/Tasks.md');
  });

  it('saves settings when a new note is entered in the field', async () => {
    const onChange = jest.spyOn(SearchComponent.prototype, 'onChange');
    const { tab, saveSettings } = makeTab('');
    tab.display();

    await onChange.mock.calls[0][0]('Notes/Tasks.md');

    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});

describe('ObsidianTaskSyncSettingTab whole-vault toggle', () => {
  it('shows the stored choice in the toggle', () => {
    const { tab, plugin } = makeTab('');
    plugin.settings.syncWholeVault = true;
    const setValue = jest.spyOn(ToggleComponent.prototype, 'setValue');

    tab.display();

    expect(setValue.mock.calls.map((call) => call[0])).toContain(true);
  });

  it('disables the location field while checked', () => {
    const { tab, plugin } = makeTab('Tasks.md', ['Tasks.md']);
    plugin.settings.syncWholeVault = true;
    const setDisabled = jest.spyOn(SearchComponent.prototype, 'setDisabled');

    tab.display();

    expect(setDisabled.mock.calls.map((call) => call[0])).toContain(true);
  });

  it('leaves the location field enabled while unchecked', () => {
    const { tab } = makeTab('Tasks.md', ['Tasks.md']);
    const setDisabled = jest.spyOn(SearchComponent.prototype, 'setDisabled');

    tab.display();

    expect(setDisabled.mock.calls.map((call) => call[0])).not.toContain(true);
  });

  it('persists and re-renders when toggled', async () => {
    const onChange = jest.spyOn(ToggleComponent.prototype, 'onChange');
    const { tab, plugin, saveSettings } = makeTab('');
    tab.display();

    await onChange.mock.calls[0][0](true);

    expect(plugin.settings.syncWholeVault).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});

describe('ObsidianTaskSyncSettingTab tag setting', () => {
  it('pre-fills the tag field with the configured tag', () => {
    const { tab, plugin } = makeTab('');
    plugin.settings.sourceTag = 'work';
    const setValue = jest.spyOn(SearchComponent.prototype, 'setValue');

    tab.display();

    expect(setValue.mock.calls.map((call) => call[0])).toContain('work');
  });

  it('strips a leading # and saves the tag', async () => {
    const onChange = jest.spyOn(SearchComponent.prototype, 'onChange');
    const { tab, plugin } = makeTab('');
    tab.display();

    // Location field is the first addSearch call, tag field the second.
    await onChange.mock.calls[1][0]('#work');

    expect(plugin.settings.sourceTag).toBe('work');
  });
});

describe('ObsidianTaskSyncSettingTab ignore-pattern setting', () => {
  it('is always visible, even for a single-note location', () => {
    const names = spySettingNames();
    makeTab('Tasks.md', ['Tasks.md']).tab.display();
    expect(names()).toContain('Ignore file patterns');
  });

  it('saves a typed pattern', async () => {
    const { tab, plugin } = makeTab('');
    tab.display();

    await saveIgnorePatterns(tab, '*.sync-conflict-*');

    expect(plugin.settings.ignoreFilePatterns).toBe('*.sync-conflict-*');
  });

  it('warns when the pattern matches the explicitly selected single note', () => {
    const { tab, plugin } = makeTab('Tasks.md', ['Tasks.md']);
    plugin.settings.ignoreFilePatterns = 'Tasks.md';

    tab.display();

    expect(ignoreDesc(tab)).toContain('will not take effect');
    expect(ignoreRow(tab).hasClass('obsidian-task-sync-ignore-ineffective')).toBe(true);
  });

  it('does not warn when the pattern does not match the selected note', () => {
    const { tab, plugin } = makeTab('Tasks.md', ['Tasks.md']);
    plugin.settings.ignoreFilePatterns = 'Other.md';

    tab.display();

    expect(ignoreDesc(tab)).not.toContain('will not take effect');
  });

  it('does not warn when no single note is selected', () => {
    const { tab, plugin } = makeTab('');
    plugin.settings.ignoreFilePatterns = 'Tasks.md';

    tab.display();

    expect(ignoreDesc(tab)).not.toContain('will not take effect');
  });

  it('does not warn while the whole-vault toggle is on, even if the field still names a match', () => {
    const { tab, plugin } = makeTab('Tasks.md', ['Tasks.md']);
    plugin.settings.syncWholeVault = true;
    plugin.settings.ignoreFilePatterns = 'Tasks.md';

    tab.display();

    expect(ignoreDesc(tab)).not.toContain('will not take effect');
  });
});
