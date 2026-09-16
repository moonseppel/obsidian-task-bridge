import { createBlockId } from '../services/sync/block-id';

const NO_DEVICE_TAG = '';

/** Cycles through fixed values so a test can force a collision. */
function sequence(values: readonly number[]): () => number {
  let index = 0;

  return () => values[index++ % values.length];
}

describe('createBlockId', () => {
  it('mints an id Obsidian accepts: lowercase letters, digits and dashes only', () => {
    expect(createBlockId(new Set(), NO_DEVICE_TAG)).toMatch(/^tb-[a-z0-9]{8}$/);
  });

  it('never returns an id the note already uses', () => {
    const taken = new Set(['tb-aaaaaaaa']);
    // The first draw spells out the taken id; the second must be tried instead.
    const random = sequence([0, 0, 0, 0, 0, 0, 0, 0, 0.5]);

    expect(createBlockId(taken, NO_DEVICE_TAG, random)).not.toBe('tb-aaaaaaaa');
  });

  it('gives up rather than looping forever when nothing is free', () => {
    const everyId = new Set([createBlockId(new Set(), NO_DEVICE_TAG, () => 0)]);

    expect(() => createBlockId(everyId, NO_DEVICE_TAG, () => 0)).toThrow(/block id/);
  });

  it('stays inside the alphabet even when the random source returns its upper bound', () => {
    expect(createBlockId(new Set(), NO_DEVICE_TAG, () => 0.999999)).toMatch(/^tb-[a-z0-9]{8}$/);
  });

  it('places the device tag directly after the prefix, before the random part', () => {
    expect(createBlockId(new Set(), 'dev1a', () => 0)).toBe('tb-dev1a-aaaaaaaa');
  });

  it('mints the untagged format when the device tag is empty', () => {
    expect(createBlockId(new Set(), NO_DEVICE_TAG)).toMatch(/^tb-[a-z0-9]{8}$/);
  });

  it('never collides across two different devices, even with the same rigged random source', () => {
    const rigged = (): number => 0;

    const fromDeviceOne = createBlockId(new Set(), 'dev-one', rigged);
    const fromDeviceTwo = createBlockId(new Set(), 'dev-two', rigged);

    expect(fromDeviceOne).not.toBe(fromDeviceTwo);
  });
});
