/**
 * Pure helpers for turning a list of note paths into the candidates shown in the
 * source-note picker. Kept free of Obsidian types so it can be unit tested in isolation.
 */

/**
 * Filter note paths by a case-insensitive substring match on the query, sorted
 * alphabetically and capped at `limit` entries. An empty query returns every path
 * (still sorted and capped).
 */
export function filterNotePaths(paths: readonly string[], query: string, limit: number): string[] {
  const needle = query.trim().toLowerCase();
  const matches = needle.length === 0
    ? [...paths]
    : paths.filter((path) => path.toLowerCase().includes(needle));

  return matches.sort((a, b) => a.localeCompare(b)).slice(0, Math.max(0, limit));
}
