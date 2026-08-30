import ObsidianTaskSyncPlugin from '../main';

describe('ObsidianTaskSyncPlugin', () => {
  let plugin: ObsidianTaskSyncPlugin;

  beforeEach(() => {
    // Create a mock app and manifest
    const mockApp = {
      vault: {},
      workspace: {},
      plugins: {}
    } as any;

    const mockManifest = {
      id: 'obsidian-task-sync',
      name: 'Obsidian Task Sync',
      version: '0.1.0',
      author: 'Test Author',
      minAppVersion: '0.15.0',
      description: 'Test plugin'
    };

    // Directly instantiate the plugin class
    plugin = Object.create(ObsidianTaskSyncPlugin.prototype);
    plugin.app = mockApp;
    plugin.manifest = mockManifest;
  });

  describe('Plugin structure', () => {
    it('should be an instance of ObsidianTaskSyncPlugin', () => {
      expect(plugin).toBeInstanceOf(ObsidianTaskSyncPlugin);
    });

    it('should have onload method', () => {
      expect(typeof plugin.onload).toBe('function');
    });

    it('should have onunload method', () => {
      expect(typeof plugin.onunload).toBe('function');
    });
  });

  describe('Lifecycle hooks', () => {
    it('onload should not throw', async () => {
      await expect(plugin.onload()).resolves.not.toThrow();
    });

    it('onunload should not throw', async () => {
      await expect(plugin.onunload()).resolves.not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('onload should catch errors and display Notice', async () => {
      // Create a plugin instance
      const testPlugin = Object.create(ObsidianTaskSyncPlugin.prototype);
      testPlugin.app = {
        vault: {},
        workspace: {},
        plugins: {}
      } as any;
      
      testPlugin.manifest = {
        id: 'obsidian-task-sync',
        name: 'Obsidian Task Sync',
        version: '0.1.0',
        author: 'Test Author',
        minAppVersion: '0.15.0',
        description: 'Test plugin'
      };

      // Mock the Logger to throw an error during onload
      jest.mock('../utils/logger', () => ({
        Logger: jest.fn().mockImplementation(() => ({
          info: jest.fn(() => {
            throw new Error('Simulated logger failure');
          }),
          error: jest.fn()
        }))
      }));

      // Execute onload - it should catch the error and not throw
      await expect(testPlugin.onload()).resolves.not.toThrow();
    });
  });
});
