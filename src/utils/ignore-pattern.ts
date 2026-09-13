/**
 * A small wildcard matcher for file names: `*` matches any run of characters, everything else is
 * literal. Patterns are comma-separated, since a sync tool's conflict-copy naming needs nothing
 * more elaborate than that to describe.
 */
export function matchesIgnorePattern(fileName: string, patterns: string): boolean {
  return parsePatterns(patterns).some((pattern) => toRegExp(pattern).test(fileName));
}

function parsePatterns(patterns: string): string[] {
  return patterns
    .split(',')
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);
}

function toRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}
