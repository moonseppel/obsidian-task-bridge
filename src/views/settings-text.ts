import { MAX_SYNC_INTERVAL_MINUTES, MIN_SYNC_INTERVAL_MINUTES } from '../utils/sync-interval';

export const SOURCE_NOTE_DISPLAY_NAME = 'Task source note';
export const SOURCE_NOTE_DESC = 'The single note whose tasks are synced. Leave empty to sync no tasks.';
export const SOURCE_NOTE_PLACEHOLDER = 'Example: Tasks.md';

export const API_TOKEN_DISPLAY_NAME = 'API token';
export const API_TOKEN_LINK_TEXT = 'Developer';
export const API_TOKEN_URL = 'https://app.todoist.com/app/settings/integrations/developer';

export const CONNECTION_DISPLAY_NAME = 'Connection';
export const TEST_CONNECTION_LABEL = 'Test connection';
export const CONNECTION_BUSY = 'A connection check is already running.';
export const TOKEN_NEEDED_FIRST = 'Select an API token first.';

export const PROJECT_DISPLAY_NAME = 'Project';
export const PROJECT_DESC =
  'Where synced tasks are created. Defaults to the Inbox, and falls back to it if the ' +
  'chosen project is deleted.';
export const PROJECT_PLACEHOLDER = 'Inbox';

export const SYNC_DISPLAY_NAME = 'Sync';
export const SYNC_INTERVAL_DISPLAY_NAME = 'Check for changes every';
export const SYNC_INTERVAL_DESC =
  'How often Todoist is polled for title changes, in minutes ' +
  `(${MIN_SYNC_INTERVAL_MINUTES}–${MAX_SYNC_INTERVAL_MINUTES}). ` +
  'Changes made in Obsidian are sent as soon as the note is saved.';

export const DEBUG_DISPLAY_NAME = 'Debug mode';
export const DEBUG_DESC = 'Leave this off unless you are diagnosing a problem.';

export function missingNoteWarning(path: string): string {
  return `Note not found at "${path}" — pick an existing note or clear the field.`;
}

export function describeApiTokenSetting(): DocumentFragment {
  return createFragment((description) => {
    description.appendText(
      'Kept in Obsidian’s secret storage, not in the plugin settings file. ' +
        'Create a token in Todoist under Settings → Integrations → ',
    );
    description.createEl('a', { text: API_TOKEN_LINK_TEXT, href: API_TOKEN_URL });
    description.appendText('. The token must be configured on every devices used separately.');
  });
}
