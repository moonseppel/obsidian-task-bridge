import { Logger } from '../utils/logger';
beforeEach(() => { jest.spyOn(Logger.prototype, 'warn').mockImplementation(); jest.spyOn(Logger.prototype, 'info').mockImplementation(); jest.spyOn(Logger.prototype, 'debug').mockImplementation(); });
afterEach(() => { jest.restoreAllMocks(); });
import { isDebugLogging, setDebugLogging } from '../utils/logger';
import {
  makePlugin,
  settingsWith,
} from './support/plugin-harness';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TaskBridgePlugin debug mode', () => {
  function bodyClasses(): { hasClass(cls: string): boolean } {
    return document.body as unknown as { hasClass(cls: string): boolean };
  }

  afterEach(() => {
    setDebugLogging(false);
    document.body.removeClass('task-bridge-debug');
  });

  it.each([[false], [true]])('mirrors debug mode %s into debug logging', (debugMode) => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith({ debugMode });

    plugin.applyDebugMode();

    expect(isDebugLogging()).toBe(debugMode);
  });

  it.each([[false], [true]])('mirrors debug mode %s into anchor visibility', (debugMode) => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith({ debugMode });

    plugin.applyDebugMode();

    expect(bodyClasses().hasClass('task-bridge-debug')).toBe(debugMode);
  });

  it('remembers the stored choice', async () => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ debugMode: true });

    await plugin.loadSettings();

    expect(plugin.settings.debugMode).toBe(true);
  });

  it.each([['yes'], [1], [null]])('falls back to off when the stored value is %s', async (stored) => {
    const { plugin, loadData } = makePlugin();
    loadData.mockResolvedValue({ debugMode: stored });

    await plugin.loadSettings();

    expect(plugin.settings.debugMode).toBe(false);
  });

  it('stops marking the body once the plugin unloads', async () => {
    const { plugin } = makePlugin();
    plugin.settings = settingsWith({ debugMode: true });
    plugin.applyDebugMode();

    await plugin.onunload();

    expect(bodyClasses().hasClass('task-bridge-debug')).toBe(false);
  });
});
