/** Lowercase only: Obsidian treats block ids case-insensitively, and capitals break its links. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export type RandomSource = () => number;

export function randomToken(length: number, random: RandomSource): string {
  let token = '';

  for (let position = 0; position < length; position += 1) {
    token += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }

  return token;
}
