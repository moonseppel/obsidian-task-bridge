import { DropdownComponent } from 'obsidian';
import { flushPendingWork, makeTab, spySettingNames } from './support/settings-harness';

const TASKS_SETUP = { statuses: [{ symbol: ' ', name: 'Todo' }, { symbol: '/', name: 'In Progress' }] };

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TaskBridgeSettingTab status mapping section', () => {
  it('is left out while the Tasks plugin is not enabled', async () => {
    const names = spySettingNames();
    makeTab('').tab.display();
    await flushPendingWork();

    expect(names()).not.toContain('Tasks plugin statuses');
  });

  it('offers one row per Tasks plugin status once the settings are open', async () => {
    const names = spySettingNames();
    const { tab, readTasksPlugin } = makeTab('');
    readTasksPlugin.mockResolvedValue(TASKS_SETUP);

    tab.display();
    await flushPendingWork();

    expect(names()).toEqual(expect.arrayContaining(['Tasks plugin statuses', '[ ] Todo', '[/] In Progress']));
  });

  it('saves the state picked for a status', async () => {
    const onChange = jest.spyOn(DropdownComponent.prototype, 'onChange');
    const { tab, readTasksPlugin, saveSettings } = makeTab('');
    readTasksPlugin.mockResolvedValue(TASKS_SETUP);
    tab.display();
    await flushPendingWork();

    await onChange.mock.calls[1][0]('open');

    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});
