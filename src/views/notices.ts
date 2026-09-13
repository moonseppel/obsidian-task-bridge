import { Notice } from 'obsidian';

const PREFIX = 'Obsidian Task Sync: ';
const UNTIL_DISMISSED = 0;

/** For something the user has to act on, so it stays up until dismissed. */
export function announce(message: string): void {
  new Notice(`${PREFIX}${message}`, UNTIL_DISMISSED);
}

/** For something worth knowing that needs no action, so it fades on its own. */
export function inform(message: string): void {
  new Notice(`${PREFIX}${message}`);
}
