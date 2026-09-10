/** Lowercase only: Obsidian treats block ids case-insensitively, and capitals break its links. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PREFIX = 'ots-';
const LENGTH = 8;
const MAX_ATTEMPTS = 100;

export type RandomSource = () => number;

export function createBlockId(taken: ReadonlySet<string>, random: RandomSource = Math.random): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = `${PREFIX}${randomSuffix(random)}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not mint a block id that is free in this note.');
}

function randomSuffix(random: RandomSource): string {
  let suffix = '';

  for (let position = 0; position < LENGTH; position += 1) {
    suffix += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }

  return suffix;
}
