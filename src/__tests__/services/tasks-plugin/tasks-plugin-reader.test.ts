import { ConfigFiles, TasksPluginReader } from '../../../services/tasks-plugin/tasks-plugin-reader';
import { Logger } from '../../../utils/logger';

const ENABLED_PLUGINS = '.obsidian/community-plugins.json';
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

  it('is enabled when the Tasks plugin is in the community plugins list', async () => {
    const { reader } = readerOf({ [ENABLED_PLUGINS]: TASKS_ENABLED });

    expect(await reader.isEnabled()).toBe(true);
  });

  it('is disabled when other community plugins are enabled but not the Tasks plugin', async () => {
    const { reader } = readerOf({ [ENABLED_PLUGINS]: JSON.stringify(['dataview']) });

    expect(await reader.isEnabled()).toBe(false);
  });

  it('is disabled in a vault with no community plugins list at all', async () => {
    const { reader } = readerOf({});

    expect(await reader.isEnabled()).toBe(false);
  });

  it('reads the list afresh every time, so enabling it applies at once', async () => {
    const { reader, files } = readerOf({ [ENABLED_PLUGINS]: JSON.stringify(['dataview']) });
    expect(await reader.isEnabled()).toBe(false);

    files.set(ENABLED_PLUGINS, TASKS_ENABLED);

    expect(await reader.isEnabled()).toBe(true);
  });

  it('is disabled and warns once when the community plugins list is broken', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { reader } = readerOf({ [ENABLED_PLUGINS]: '{ not json' });

    expect(await reader.isEnabled()).toBe(false);
    expect(await reader.isEnabled()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns again once a list that was repaired breaks anew', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { reader, files } = readerOf({ [ENABLED_PLUGINS]: '{ not json' });

    await reader.isEnabled();
    files.set(ENABLED_PLUGINS, TASKS_ENABLED);
    await reader.isEnabled();
    files.set(ENABLED_PLUGINS, '{ not json');
    await reader.isEnabled();

    expect(warn).toHaveBeenCalledTimes(2);
  });
});
