import { RandomSource, randomToken } from '../../../utils/random-token';

const PREFIX = 'tb-';
const LENGTH = 8;
const MAX_ATTEMPTS = 100;

/**
 * The device tag is baked into every id minted here, making the same id vanishingly unlikely to be
 * minted independently by two different devices. An empty tag mints the original untagged format,
 * which ids minted before the tag existed still use.
 */
export function createBlockId(
  taken: ReadonlySet<string>,
  deviceTag: string,
  random: RandomSource = Math.random,
): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = `${PREFIX}${tagSegment(deviceTag)}${randomToken(LENGTH, random)}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not mint a block id that is free in this note.');
}

function tagSegment(deviceTag: string): string {
  return deviceTag.length === 0 ? '' : `${deviceTag}-`;
}
