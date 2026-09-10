import { filterByQuery } from './query-filter';

export function filterNotePaths(paths: readonly string[], query: string, limit: number): string[] {
  return filterByQuery(paths, query, limit);
}
