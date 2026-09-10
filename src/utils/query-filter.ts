export function filterByQuery(values: readonly string[], query: string, limit: number): string[] {
  const needle = query.trim().toLowerCase();
  const matches = needle.length === 0
    ? [...values]
    : values.filter((value) => value.toLowerCase().includes(needle));

  return matches.sort((a, b) => a.localeCompare(b)).slice(0, Math.max(0, limit));
}
