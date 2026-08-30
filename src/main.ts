import { Plugin, Notice } from 'obsidian';
import { Logger } from './utils/logger';

const logger = new Logger('ObsidianTaskSync');

export default class ObsidianTaskSyncPlugin extends Plugin {
  async onload(): Promise<void> {
    try {
      logger.info('Obsidian Task Sync plugin loaded');
      // Plugin initialization will happen here in future phases
    } catch (error) {
      const userMessage = 'Failed to load Obsidian Task Sync plugin. Check console for details or contact the author with the console output.';
      
      logger.error('Plugin load failed', error);
      new Notice(userMessage);
    }
  }

  async onunload(): Promise<void> {
    logger.info('Obsidian Task Sync plugin unloaded');
    // Cleanup will happen here in future phases
  }
}
