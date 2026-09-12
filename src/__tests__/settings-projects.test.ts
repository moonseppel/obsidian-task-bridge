import {
  makeTab,
  flushPendingWork,
} from './support/settings-harness';

afterEach(() => {
  jest.restoreAllMocks();
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

  it('refreshes after the provider reports new credentials', async () => {
    const { tab, refreshKnownProjects } = makeTab('');
    tab.display();
    await flushPendingWork();
    refreshKnownProjects.mockClear();

    await (tab as unknown as { reconnect(): Promise<void> }).reconnect();

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
  it('picks a project as soon as credentials arrive, without waiting for a restart', async () => {
    const { tab, ensureProjectSelected } = makeTab('');

    await (tab as unknown as { reconnect(): Promise<void> }).reconnect();

    expect(ensureProjectSelected).toHaveBeenCalledTimes(1);
  });

  it('refreshes the list before choosing, so the same list is not fetched twice', async () => {
    const { tab, refreshKnownProjects, ensureProjectSelected } = makeTab('');

    await (tab as unknown as { reconnect(): Promise<void> }).reconnect();

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
