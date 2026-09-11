/** Lowercase only: Obsidian treats block ids case-insensitively, and capitals break its links. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PREFIX = 'ots-';
const LENGTH = 8;
const MAX_ATTEMPTS = 100;

export type RandomSource = () => number;

/**
 * `deviceTag`, when given, is baked into every id minted here, making the same id vanishingly
 * unlikely to be minted independently by two different devices. An id minted with no tag (the
 * default) keeps today's format, so ids minted before this existed remain valid and untouched.
 */
export function createBlockId(
  taken: ReadonlySet<string>,
  random: RandomSource = Math.random,
  deviceTag = '',
): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = `${PREFIX}${randomSuffix(random)}${tagSuffix(deviceTag)}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not mint a block id that is free in this note.');
}

function tagSuffix(deviceTag: string): string {
  return deviceTag.length === 0 ? '' : `-${deviceTag}`;
}

function randomSuffix(random: RandomSource): string {
  let suffix = '';

  for (let position = 0; position < LENGTH; position += 1) {
    suffix += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }

  return suffix;
}
