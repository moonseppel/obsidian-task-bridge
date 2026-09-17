export const MIN_SYNC_INTERVAL_MINUTES = 1;
export const MAX_SYNC_INTERVAL_MINUTES = 1440;
/** The one value outside that range: automatic syncing is off and only the command syncs. */
export const SYNC_DISABLED_MINUTES = 0;

export function toSyncIntervalMinutes(value: unknown, fallback: number): number {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  // An empty field means the user is still typing, not that they want automatic syncing off.
  const parsed = text.length === 0 ? Number.NaN : Number(text);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const minutes = Math.round(parsed);

  if (minutes <= SYNC_DISABLED_MINUTES) {
    return SYNC_DISABLED_MINUTES;
  }

  return Math.min(MAX_SYNC_INTERVAL_MINUTES, Math.max(MIN_SYNC_INTERVAL_MINUTES, minutes));
}

export function isAutomaticSyncEnabled(minutes: number): boolean {
  return minutes > SYNC_DISABLED_MINUTES;
}
