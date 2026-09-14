import { getDeviceTag } from '../services/sync/device-tag';

/** A minimal in-memory stand-in for the one storage method this module actually uses. */
function fakeStorage(initial: string | null = null): Storage {
  let value = initial;

  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  } as unknown as Storage;
}

describe('getDeviceTag', () => {
  it('generates a tag when the storage is empty', () => {
    expect(getDeviceTag(fakeStorage())).toMatch(/^[a-z0-9]{6}$/);
  });

  it('persists the generated tag into storage', () => {
    const storage = fakeStorage();

    const tag = getDeviceTag(storage);

    expect(storage.getItem('task-bridge-device-tag')).toBe(tag);
  });

  it('reuses the stored tag rather than generating a new one on every call', () => {
    const storage = fakeStorage();
    const random = jest.fn(() => 0);

    const first = getDeviceTag(storage, random);
    random.mockClear();
    const second = getDeviceTag(storage, random);

    expect(second).toBe(first);
    expect(random).not.toHaveBeenCalled();
  });

  it('returns the tag already in storage untouched', () => {
    expect(getDeviceTag(fakeStorage('already-there'))).toBe('already-there');
  });
});
