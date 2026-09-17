import { RandomSource, randomToken } from '../../../utils/random-token';

const LENGTH = 6;
const STORAGE_KEY = 'task-bridge-device-tag';

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

  const generated = randomToken(LENGTH, random);
  storage.setItem(STORAGE_KEY, generated);

  return generated;
}
