import { DEFAULT_SETTINGS, ObsidianTaskSyncSettings } from './settings';
import { toSyncIntervalMinutes } from './utils/sync-interval';
import { ProviderProject } from './services/task-provider';
import { isRecord } from './utils/type-guards';

/**
 * Reads what was written to `data.json` last time. Every value is checked rather than trusted,
 * because a file edited by hand, restored from a backup or half-written by a vault sync would
 * otherwise reach the plugin as the wrong type.
 */
export function toSettings(stored: unknown): ObsidianTaskSyncSettings {
  const record = isRecord(stored) ? stored : {};

  return {
    relativeTaskSourceNotePath: readText(
      record.relativeTaskSourceNotePath,
      DEFAULT_SETTINGS.relativeTaskSourceNotePath,
    ),
    // The pre-rename keys are still read, so a vault written before the move keeps its project.
    projectId: readText(record.projectId ?? record.todoistProjectId, DEFAULT_SETTINGS.projectId),
    projectName: readText(record.projectName ?? record.todoistProjectName, DEFAULT_SETTINGS.projectName),
    syncIntervalMinutes: toSyncIntervalMinutes(
      record.syncIntervalMinutes,
      DEFAULT_SETTINGS.syncIntervalMinutes,
    ),
    debugMode: record.debugMode === true,
  };
}

/** Anything malformed is dropped: a bad entry would offer the user a project that cannot exist. */
export function toKnownProjects(stored: unknown): ProviderProject[] {
  return Array.isArray(stored) ? stored.filter(isProviderProject) : [];
}

/**
 * The provider owns the shape of its own credentials, so this only locates the blob. The legacy
 * top-level key is still read, so a vault written before the move keeps its token selection.
 */
export function readProviderCredentials(stored: unknown): unknown {
  const stored_ = isRecord(stored) ? stored : {};

  if (isRecord(stored_.providerCredentials)) {
    return stored_.providerCredentials;
  }

  return { apiTokenSecretName: stored_.todoistApiTokenSecretName };
}

export function readStoredField(stored: unknown, field: string): unknown {
  return isRecord(stored) ? stored[field] : undefined;
}

function isProviderProject(value: unknown): value is ProviderProject {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    typeof value.isDefault === 'boolean'
  );
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
