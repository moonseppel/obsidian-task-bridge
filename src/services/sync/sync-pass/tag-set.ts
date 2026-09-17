/**
 * Order and duplicates never count as a change: Todoist itself collapses a duplicated label, so
 * treating "a, a" and "a" as one set avoids chasing a difference that was never there.
 */
export function canonicalTags(tags: readonly string[]): string[] {
  return [...new Set(tags)].sort();
}

export function sameTagSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = canonicalTags(left);
  const sortedRight = canonicalTags(right);

  return sortedLeft.length === sortedRight.length && sortedLeft.every((tag, index) => tag === sortedRight[index]);
}
