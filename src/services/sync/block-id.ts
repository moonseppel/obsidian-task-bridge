import { RandomSource, randomToken } from '../../utils/random-token';

const PREFIX = 'ots-';
const LENGTH = 8;
const MAX_ATTEMPTS = 100;

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
    const candidate = `${PREFIX}${randomToken(LENGTH, random)}${tagSuffix(deviceTag)}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not mint a block id that is free in this note.');
}

function tagSuffix(deviceTag: string): string {
  return deviceTag.length === 0 ? '' : `-${deviceTag}`;
}
