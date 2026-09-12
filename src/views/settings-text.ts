import { MAX_SYNC_INTERVAL_MINUTES, MIN_SYNC_INTERVAL_MINUTES } from '../utils/sync-interval';

export const SOURCE_NOTE_DISPLAY_NAME = 'Task source note';
export const SOURCE_NOTE_DESC = 'The single note whose tasks are synced. Leave empty to sync no tasks.';
export const SOURCE_NOTE_PLACEHOLDER = 'Example: Tasks.md';

export const CONNECTION_DISPLAY_NAME = 'Connection';
export const TEST_CONNECTION_LABEL = 'Test connection';
export const CONNECTION_BUSY = 'A connection check is already running.';

export const PROJECT_DISPLAY_NAME = 'Project';

export function projectDescription(defaultProjectName: string): string {
  return (
    `Where synced tasks are created. Defaults to the ${defaultProjectName}, and falls back to ` +
    'it if the chosen project is deleted.'
  );
}

export const SYNC_DISPLAY_NAME = 'Sync';
export const SYNC_INTERVAL_DISPLAY_NAME = 'Check for changes every';
export function syncIntervalDescription(providerName: string): string {
  return (
    `How often ${providerName} is polled for title changes, in minutes ` +
    `(${MIN_SYNC_INTERVAL_MINUTES}–${MAX_SYNC_INTERVAL_MINUTES}). ` +
    'Changes made in Obsidian are sent as soon as the note is saved.'
  );
}

export const DEBUG_DISPLAY_NAME = 'Debug mode';
export const DEBUG_DESC = 'Leave this off unless you are diagnosing a problem.';

export function missingNoteWarning(path: string): string {
  return `Note not found at "${path}" — pick an existing note or clear the field.`;
}
