import { sanitizeForDisplay } from '../../utils/external-text';
import { isRecord } from '../../utils/type-guards';
import { UserStatus } from '../user-status';

/** What the Tasks plugin offers until its settings say otherwise. */
export const DEFAULT_TASKS_STATUSES: readonly UserStatus[] = [
  { symbol: ' ', name: 'Todo' },
  { symbol: 'x', name: 'Done' },
  { symbol: '/', name: 'In Progress' },
  { symbol: '-', name: 'Cancelled' },
];

/**
 * The statuses in the Tasks plugin's own settings, core ones first. The file is written by another
 * plugin, so every entry is checked: a symbol a checkbox cannot hold drops it, and where two share a
 * symbol the first wins, as it does in the Tasks plugin.
 */
export function readTasksStatuses(settings: unknown): readonly UserStatus[] {
  const statusSettings = isRecord(settings) ? settings.statusSettings : undefined;

  if (!isRecord(statusSettings)) {
    return DEFAULT_TASKS_STATUSES;
  }

  const entries = [...listOf(statusSettings.coreStatuses), ...listOf(statusSettings.customStatuses)];

  return firstPerSymbol(entries.flatMap(toUserStatus));
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function toUserStatus(entry: unknown): UserStatus[] {
  if (!isRecord(entry) || typeof entry.symbol !== 'string' || entry.symbol.length !== 1) {
    return [];
  }

  return [{ symbol: entry.symbol, name: sanitizeForDisplay(entry.name) }];
}

function firstPerSymbol(statuses: readonly UserStatus[]): UserStatus[] {
  const seen = new Set<string>();

  return statuses.filter((status) => {
    const isFirst = !seen.has(status.symbol);
    seen.add(status.symbol);
    return isFirst;
  });
}
