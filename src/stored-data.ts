import { DEFAULT_SETTINGS, TaskBridgeSettings } from './settings';
import { toSyncIntervalMinutes } from './utils/sync-interval';
import { ProviderProject } from './services/task-provider';
import { isNonEmptyString, isRecord } from './utils/type-guards';
import { warnAboutUnreadableEntries } from './utils/unreadable-entries';

/**
 * Reads what was written to `data.json` last time. Every value is checked rather than trusted,
 * because a file edited by hand, restored from a backup or half-written by a vault sync would
 * otherwise reach the plugin as the wrong type.
 */
export function toSettings(stored: unknown): TaskBridgeSettings {
  const record = isRecord(stored) ? stored : {};

  return {
    // relativeTaskSourceNotePath is Feature 9's pre-rename key: a note-only path is still a valid
    // value of the widened field, so a vault written before this feature keeps its source note.
    relativeTaskSourcePath: readText(
      record.relativeTaskSourcePath ?? record.relativeTaskSourceNotePath,
      DEFAULT_SETTINGS.relativeTaskSourcePath,
    ),
    syncWholeVault: record.syncWholeVault === true,
    sourceTag: readText(record.sourceTag, DEFAULT_SETTINGS.sourceTag),
    ignoreFilePatterns: readText(record.ignoreFilePatterns, DEFAULT_SETTINGS.ignoreFilePatterns),
    // The pre-rename keys are still read, so a vault written before the move keeps its project.
    projectId: readText(record.projectId ?? record.todoistProjectId, DEFAULT_SETTINGS.projectId),
    projectName: readText(record.projectName ?? record.todoistProjectName, DEFAULT_SETTINGS.projectName),
    syncIntervalMinutes: toSyncIntervalMinutes(record.syncIntervalMinutes, DEFAULT_SETTINGS.syncIntervalMinutes),
    debugMode: record.debugMode === true,
    lastCredentialReminderAt: readNumber(
      record.lastCredentialReminderAt,
      DEFAULT_SETTINGS.lastCredentialReminderAt,
    ),
  };
}

/** Anything malformed is dropped: a bad entry would offer the user a project that cannot exist. */
export function toKnownProjects(stored: unknown): ProviderProject[] {
  const projects = Array.isArray(stored) ? stored.filter(isProviderProject) : [];

  warnAboutUnreadableEntries('remembered projects', stored, projects.length);
  return projects;
}

/**
 * The provider owns the shape of its own credentials, so this only locates the blob. The legacy
 * top-level key is still read, so a vault written before the move keeps its token selection.
 */
export function readProviderCredentials(stored: unknown): unknown {
  const record = isRecord(stored) ? stored : {};

  if (isRecord(record.providerCredentials)) {
    return record.providerCredentials;
  }

  return { apiTokenSecretName: record.todoistApiTokenSecretName };
}

export function readStoredField(stored: unknown, field: string): unknown {
  return isRecord(stored) ? stored[field] : undefined;
}

function isProviderProject(value: unknown): value is ProviderProject {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === 'string' &&
    typeof value.isDefault === 'boolean'
  );
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
