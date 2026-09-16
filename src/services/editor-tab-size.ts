import { Vault } from 'obsidian';

/**
 * `tabSize` is a real vault config key, but Obsidian's public typings only mention it in a doc
 * comment, so the cast lives here — the one seam between the untyped editor setting and the sync
 * engine. `getConfig` is optional because it need not exist at all: on mobile, or in a future
 * Obsidian that drops it. What comes back stays `unknown` until `indentationOf` validates it.
 */
interface ConfigurableVault {
  getConfig?: (key: string) => unknown;
}

export function readEditorTabSize(vault: Vault): unknown {
  return (vault as unknown as ConfigurableVault).getConfig?.('tabSize');
}
