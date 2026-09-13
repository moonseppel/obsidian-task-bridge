import { filterByQuery } from '../utils/query-filter';

/** Capped, so a picker over a large vault stays short enough to scan. */
const MAX_SUGGESTIONS = 50;

export function matchingSuggestions<T>(items: readonly T[], labelOf: (item: T) => string, query: string): T[] {
  const itemsByLabel = new Map(items.map((item): [string, T] => [labelOf(item), item]));

  return filterByQuery([...itemsByLabel.keys()], query, MAX_SUGGESTIONS)
    .map((label) => itemsByLabel.get(label))
    .filter((item): item is T => item !== undefined);
}
