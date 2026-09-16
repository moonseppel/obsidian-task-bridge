import { Vault } from 'obsidian';
import { readEditorTabSize } from '../services/editor-tab-size';

function vaultConfigured(config: Record<string, unknown>): Vault {
  return { getConfig: (key: string) => config[key] } as unknown as Vault;
}

describe('readEditorTabSize', () => {
  it('reads the editor tab size out of the vault config', () => {
    expect(readEditorTabSize(vaultConfigured({ tabSize: 2 }))).toBe(2);
  });

  it('reads nothing when the vault has no such setting', () => {
    expect(readEditorTabSize(vaultConfigured({}))).toBeUndefined();
  });

  it('reads nothing on a vault that offers no config at all', () => {
    expect(readEditorTabSize({} as unknown as Vault)).toBeUndefined();
  });

  it('hands the raw value on unvalidated, whatever shape it has', () => {
    expect(readEditorTabSize(vaultConfigured({ tabSize: 'four' }))).toBe('four');
  });
});
