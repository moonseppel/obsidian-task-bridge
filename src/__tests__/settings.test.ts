import { App, SearchComponent, Setting, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianTaskSyncSettingTab } from '../settings';
import type ObsidianTaskSyncPlugin from '../main';

/** Shape of the mock DOM element (`src/__mocks__/obsidian.ts`) that tests poke at. */
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
  /** Mutable set of note paths that "exist" in the fake vault. */
  existingPaths: string[];
}

function makeTab(relativeTaskSourceNotePath: string, existingPaths: string[] = []): TabContext {
  const app = {
    vault: {
      getMarkdownFiles: (): TFile[] => existingPaths.map(tfile),
      getAbstractFileByPath: (path: string): TFile | null =>
        existingPaths.includes(path) ? tfile(path) : null,
    },
  } as unknown as App;

  const saveSettings = jest.fn().mockResolvedValue(undefined);
  const plugin = { app, settings: { relativeTaskSourceNotePath }, saveSettings } as unknown as ObsidianTaskSyncPlugin;

  return { tab: new ObsidianTaskSyncSettingTab(app, plugin), plugin, saveSettings, existingPaths };
}

/** Spy that records the name given to every `Setting` the tab renders. */
function spySettingNames(): () => string[] {
  const spy = jest.spyOn(Setting.prototype, 'setName');
  return () => spy.mock.calls.map((call) => String(call[0]));
}

/** Descriptions passed to `Setting.setDesc`, most recent last. */
function spySettingDescs(): () => string[] {
  const spy = jest.spyOn(Setting.prototype, 'setDesc');
  return () => spy.mock.calls.map((call) => String(call[0]));
}

function isSourceNoteMissing(tab: ObsidianTaskSyncSettingTab): boolean {
  return (tab as unknown as { isSourceNoteMissing(): boolean }).isSourceNoteMissing();
}

/** The row element the tab styles for the "missing" state. */
function settingRow(tab: ObsidianTaskSyncSettingTab): TestEl {
  return (tab as unknown as { sourceSetting: { settingEl: TestEl } }).sourceSetting.settingEl;
}

/** The search input element, so tests can dispatch a `blur` event at it. */
function sourceInput(tab: ObsidianTaskSyncSettingTab): TestEl {
  return (tab as unknown as { sourceInputEl: TestEl }).sourceInputEl;
}

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
    const descs = spySettingDescs();
    makeTab('missing/Note.md').tab.display();
    expect(descs().at(-1)).toContain('not found');
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
    const descs = spySettingDescs();
    const { tab, existingPaths } = makeTab('Tasks.md', []); // configured but currently missing
    tab.display();
    expect(descs().at(-1)).toContain('not found');

    existingPaths.push('Tasks.md'); // the note now exists
    sourceInput(tab).dispatch('blur');

    expect(descs().at(-1)).not.toContain('not found');
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
