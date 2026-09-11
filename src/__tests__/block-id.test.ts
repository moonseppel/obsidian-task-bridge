import { createBlockId } from '../services/sync/block-id';

/** Cycles through fixed values so a test can force a collision. */
function sequence(values: readonly number[]): () => number {
  let index = 0;

  return () => values[index++ % values.length];
}

describe('createBlockId', () => {
  it('mints an id Obsidian accepts: lowercase letters, digits and dashes only', () => {
    expect(createBlockId(new Set())).toMatch(/^ots-[a-z0-9]{8}$/);
  });

  it('never returns an id the note already uses', () => {
    const taken = new Set(['ots-aaaaaaaa']);
    // The first draw spells out the taken id; the second must be tried instead.
    const random = sequence([0, 0, 0, 0, 0, 0, 0, 0, 0.5]);

    expect(createBlockId(taken, random)).not.toBe('ots-aaaaaaaa');
  });

  it('gives up rather than looping forever when nothing is free', () => {
    const everyId = new Set([createBlockId(new Set(), () => 0)]);

    expect(() => createBlockId(everyId, () => 0)).toThrow(/block id/);
  });

  it('stays inside the alphabet even when the random source returns its upper bound', () => {
    expect(createBlockId(new Set(), () => 0.999999)).toMatch(/^ots-[a-z0-9]{8}$/);
  });

  it('bakes the device tag onto the end of the id', () => {
    expect(createBlockId(new Set(), () => 0, 'dev1a')).toBe('ots-aaaaaaaa-dev1a');
  });

  it('mints today\'s untagged format when no device tag is given', () => {
    expect(createBlockId(new Set())).toMatch(/^ots-[a-z0-9]{8}$/);
  });

  it('never collides across two different devices, even with the same rigged random source', () => {
    const rigged = (): number => 0;

    const fromDeviceOne = createBlockId(new Set(), rigged, 'dev-one');
    const fromDeviceTwo = createBlockId(new Set(), rigged, 'dev-two');

    expect(fromDeviceOne).not.toBe(fromDeviceTwo);
  });
});
