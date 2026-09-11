export const MIN_SYNC_INTERVAL_MINUTES = 1;
export const MAX_SYNC_INTERVAL_MINUTES = 1440;

export function toSyncIntervalMinutes(value: unknown, fallback: number): number {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  // An empty field means the user is still typing, not that they want the shortest interval.
  const parsed = text.length === 0 ? Number.NaN : Number(text);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(MAX_SYNC_INTERVAL_MINUTES, Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(parsed)));
}
