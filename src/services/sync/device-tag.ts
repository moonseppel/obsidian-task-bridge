const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LENGTH = 6;
const STORAGE_KEY = 'obsidian-task-sync-device-tag';

export type RandomSource = () => number;

/**
 * Kept in the given storage, never in `data.json` — that file is exactly what a vault-sync tool
 * propagates between devices, so anything stored there would stop being device-unique. Generated
 * once and reused from then on, so every block id this device mints carries the same tag.
 */
export function getDeviceTag(storage: Storage, random: RandomSource = Math.random): string {
  const existing = storage.getItem(STORAGE_KEY);

  if (existing !== null && existing.length > 0) {
    return existing;
  }

  const generated = randomTag(random);
  storage.setItem(STORAGE_KEY, generated);

  return generated;
}

function randomTag(random: RandomSource): string {
  let tag = '';

  for (let position = 0; position < LENGTH; position += 1) {
    tag += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }

  return tag;
}
