import { ConfigFiles, TasksPluginReader } from '../../../services/tasks-plugin/tasks-plugin-reader';
import { DEFAULT_TASKS_STATUSES } from '../../../services/tasks-plugin/tasks-statuses';
import { Logger } from '../../../utils/logger';

const ENABLED_PLUGINS = '.obsidian/community-plugins.json';
const TASKS_SETTINGS = '.obsidian/plugins/obsidian-tasks-plugin/data.json';
const TASKS_ENABLED = JSON.stringify(['obsidian-tasks-plugin']);

function configFiles(contents: Map<string, string>): ConfigFiles {
  return {
    exists: async (path) => contents.has(path),
    read: async (path) => contents.get(path) ?? '',
  };
}

function readerOf(contents: Record<string, string>): { reader: TasksPluginReader; files: Map<string, string> } {
  const files = new Map(Object.entries(contents));

  return { reader: new TasksPluginReader(configFiles(files), '.obsidian'), files };
}

describe('TasksPluginReader', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('finds nothing while the Tasks plugin is not enabled', async () => {
    const { reader } = readerOf({ [ENABLED_PLUGINS]: JSON.stringify(['dataview']) });

    expect(await reader.read()).toBeUndefined();
  });

  it('finds nothing in a vault with no community plugins enabled at all', async () => {
    const { reader } = readerOf({});

    expect(await reader.read()).toBeUndefined();
  });

  it("applies the Tasks plugin's default statuses when it has no settings file", async () => {
    const { reader } = readerOf({ [ENABLED_PLUGINS]: TASKS_ENABLED });

    expect(await reader.read()).toEqual({ statuses: DEFAULT_TASKS_STATUSES });
  });

  it("reads the statuses out of the Tasks plugin's settings file", async () => {
    const settings = { statusSettings: { coreStatuses: [{ symbol: ' ', name: 'Todo' }], customStatuses: [] } };
    const { reader } = readerOf({ [ENABLED_PLUGINS]: TASKS_ENABLED, [TASKS_SETTINGS]: JSON.stringify(settings) });

    expect(await reader.read()).toEqual({ statuses: [{ symbol: ' ', name: 'Todo' }] });
  });

  it('reads the settings file afresh every time, so a change there applies at once', async () => {
    const { reader, files } = readerOf({ [ENABLED_PLUGINS]: TASKS_ENABLED });
    await reader.read();

    files.set(TASKS_SETTINGS, JSON.stringify({ statusSettings: { coreStatuses: [{ symbol: '!', name: 'Now' }] } }));

    expect(await reader.read()).toEqual({ statuses: [{ symbol: '!', name: 'Now' }] });
  });

  it('applies the default statuses when the settings file is broken', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { reader } = readerOf({ [ENABLED_PLUGINS]: TASKS_ENABLED, [TASKS_SETTINGS]: '{ not json' });

    expect(await reader.read()).toEqual({ statuses: DEFAULT_TASKS_STATUSES });
  });

  it('warns about a broken settings file only when it starts being broken', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { reader } = readerOf({ [ENABLED_PLUGINS]: TASKS_ENABLED, [TASKS_SETTINGS]: '{ not json' });

    await reader.read();
    await reader.read();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns again once a settings file that was repaired breaks anew', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { reader, files } = readerOf({ [ENABLED_PLUGINS]: TASKS_ENABLED, [TASKS_SETTINGS]: '{ not json' });

    await reader.read();
    files.set(TASKS_SETTINGS, '{}');
    await reader.read();
    files.set(TASKS_SETTINGS, '{ not json');
    await reader.read();

    expect(warn).toHaveBeenCalledTimes(2);
  });
});
