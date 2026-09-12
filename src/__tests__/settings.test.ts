import { SearchComponent } from 'obsidian';
import { DEFAULT_SETTINGS } from '../settings';
import {
  makeTab,
  sourceDesc,
  isSourceNoteMissing,
  settingRow,
  sourceInput,
  spySettingNames,
} from './support/settings-harness';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DEFAULT_SETTINGS', () => {
  it('has an empty source note path', () => {
    expect(DEFAULT_SETTINGS.relativeTaskSourceNotePath).toBe('');
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
