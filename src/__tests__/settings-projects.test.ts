import { flushPendingWork, makeTab, reconnect, testConnection } from './support/settings-harness';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TaskBridgeSettingTab project list', () => {
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

    await reconnect(tab);

    expect(refreshKnownProjects).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the connection is tested', async () => {
    const { tab, refreshKnownProjects } = makeTab('');
    tab.display();
    await flushPendingWork();
    refreshKnownProjects.mockClear();

    await testConnection(tab);

    expect(refreshKnownProjects).toHaveBeenCalledTimes(1);
  });
});

describe('TaskBridgeSettingTab choosing a default project', () => {
  it('picks a project as soon as credentials arrive, without waiting for a restart', async () => {
    const { tab, ensureProjectSelected } = makeTab('');

    await reconnect(tab);

    expect(ensureProjectSelected).toHaveBeenCalledTimes(1);
  });

  it('refreshes the list before choosing, so the same list is not fetched twice', async () => {
    const { tab, refreshKnownProjects, ensureProjectSelected } = makeTab('');

    await reconnect(tab);

    expect(refreshKnownProjects.mock.invocationCallOrder[0]).toBeLessThan(
      ensureProjectSelected.mock.invocationCallOrder[0],
    );
  });

  it('also picks a project after the connection is tested', async () => {
    const { tab, ensureProjectSelected } = makeTab('');

    await testConnection(tab);

    expect(ensureProjectSelected).toHaveBeenCalledTimes(1);
  });
});
