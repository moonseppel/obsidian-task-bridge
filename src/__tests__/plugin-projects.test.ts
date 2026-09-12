import { TaskProviderError } from '../services/task-provider-error';
import {
  PluginContext,
  makePlugin,
  settingsWith,
} from './support/plugin-harness';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ObsidianTaskSyncPlugin remembered projects', () => {
  const PROJECT = { id: 'p1', name: 'Errands', isDefault: false };

  it('persists the project list alongside the settings', async () => {
    const { plugin, saveData } = makePlugin();
    plugin.knownProjects = [PROJECT];

    await plugin.saveSettings();

    expect(saveData).toHaveBeenCalledWith(expect.objectContaining({ knownProjects: [PROJECT] }));
  });

  it('restores the list from last time, so the picker works offline', async () => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ knownProjects: [PROJECT] });

    await plugin.loadSettings();

    expect(plugin.knownProjects).toEqual([PROJECT]);
  });

  it.each([
    ['not an array'],
    [[{ id: 'p1' }]],
    [[{ id: '', name: 'Nameless', isDefault: false }]],
    [[{ id: 'p1', name: 'Errands' }]],
  ])('drops a stored list that reads as %s', async (stored) => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ knownProjects: stored });

    await plugin.loadSettings();

    expect(plugin.knownProjects).toEqual([]);
  });

  it('keeps the previous list when the provider cannot be reached', async () => {
    const { plugin } = makePlugin();
    plugin.knownProjects = [PROJECT];
    (plugin as unknown as { provider: { listProjects: () => Promise<never> } }).provider = {
      listProjects: () => Promise.reject(new TaskProviderError('unreachable')),
    };

    await plugin.refreshKnownProjects();

    expect(plugin.knownProjects).toEqual([PROJECT]);
  });

  it('replaces the list on a successful refresh', async () => {
    const { plugin } = makePlugin();
    plugin.knownProjects = [PROJECT];
    (plugin as unknown as { provider: { listProjects: () => Promise<unknown> } }).provider = {
      listProjects: () => Promise.resolve([{ id: 'p2', name: 'Inbox', isDefault: true }]),
    };

    await plugin.refreshKnownProjects();

    expect(plugin.knownProjects).toEqual([{ id: 'p2', name: 'Inbox', isDefault: true }]);
  });
});

describe('ObsidianTaskSyncPlugin choosing a default project', () => {
  const INBOX = { id: 'inbox-1', name: 'Inbox', isDefault: true };

  function pluginWithProjects(projects: unknown[]): PluginContext {
    const context = makePlugin();
    (context.plugin as unknown as { provider: { listProjects: () => Promise<unknown> } }).provider = {
      listProjects: () => Promise.resolve(projects),
    };

    return context;
  }

  it('asks for the project list when nothing has been remembered yet', async () => {
    const { plugin } = pluginWithProjects([INBOX]);
    plugin.settings = settingsWith();

    await plugin.ensureProjectSelected();

    expect(plugin.settings.projectId).toBe('inbox-1');
    expect(plugin.settings.projectName).toBe('Inbox');
  });

  it('uses the remembered list rather than asking again', async () => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith();
    plugin.knownProjects = [INBOX];

    await plugin.ensureProjectSelected();

    expect(plugin.settings.projectId).toBe('inbox-1');
  });

  it('leaves a project the user already chose alone', async () => {
    const { plugin } = pluginWithProjects([INBOX]);
    plugin.settings = settingsWith({ projectId: 'p1', projectName: 'Errands' });

    await plugin.ensureProjectSelected();

    expect(plugin.settings.projectName).toBe('Errands');
  });

  it('leaves the field empty rather than failing when the list cannot be fetched', async () => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith();
    (plugin as unknown as { provider: { listProjects: () => Promise<never> } }).provider = {
      listProjects: () => Promise.reject(new TaskProviderError('unreachable')),
    };

    await expect(plugin.ensureProjectSelected()).resolves.toBeUndefined();
    expect(plugin.settings.projectId).toBe('');
  });
});
