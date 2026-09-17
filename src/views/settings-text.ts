import { MAX_SYNC_INTERVAL_MINUTES, MIN_SYNC_INTERVAL_MINUTES, SYNC_DISABLED_MINUTES } from '../utils/sync-interval';

export const WHOLE_VAULT_DISPLAY_NAME = 'Sync the whole vault';
export const WHOLE_VAULT_DESC =
  'Sync every task in the vault. Overrides the note or folder selected below, ' +
  'which stays disabled while this is checked.';

export const SOURCE_LOCATION_DISPLAY_NAME = 'Note or folder';
export const SOURCE_LOCATION_DESC =
  'The note or folder whose tasks are synced. A note syncs just that note; a folder syncs every ' +
  'note under it. Leave empty, or check "Sync the whole vault" above, to sync no tasks from here.';
export const SOURCE_LOCATION_DISABLED_DESC = 'Disabled while "Sync the whole vault" is checked.';
export const SOURCE_LOCATION_PLACEHOLDER = 'Example: Tasks.md or Projects/Work';

export const SOURCE_TAG_DISPLAY_NAME = 'Tag';
export const SOURCE_TAG_DESC =
  'Only sync task lines carrying this tag, narrowing whatever the note, folder or whole vault ' +
  'above resolves to. Leave empty to sync every task in scope.';
export const SOURCE_TAG_PLACEHOLDER = 'Example: sync';

export const IGNORE_PATTERNS_DISPLAY_NAME = 'Ignore file patterns';
export const IGNORE_PATTERNS_DESC =
  'Comma-separated file name patterns to skip when scanning a folder or the whole vault, such as ' +
  'the conflict copies a third-party sync tool creates. "*" matches any run of characters.';
export const IGNORE_PATTERNS_PLACEHOLDER = 'Example: *.sync-conflict-*';

export const IGNORE_PATTERNS_INEFFECTIVE_WARNING =
  'This pattern will not take effect: the note selected above is always synced regardless of ignore patterns.';

export function missingLocationWarning(path: string): string {
  return `Note or folder not found at "${path}" — pick an existing one or clear the field.`;
}

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
    `How often ${providerName} is polled for changes, in minutes ` +
    `(${MIN_SYNC_INTERVAL_MINUTES}–${MAX_SYNC_INTERVAL_MINUTES}). ` +
    'Changes made in Obsidian are sent shortly after you stop editing. ' +
    `Set it to ${SYNC_DISABLED_MINUTES} to stop syncing automatically altogether, ` +
    'leaving the "Sync now" command as the only way to sync.'
  );
}

export const DEBUG_DISPLAY_NAME = 'Debug mode';
export const DEBUG_DESC = 'Leave this off unless you are diagnosing a problem.';
