/**
 * Built the same way every time, so un-flagging (a later slice) can revert it by discarding
 * everything but the embedded block id — the description is a courtesy notice only; the removal
 * date it names is never read back, only the plugin's own stored data decides that.
 */
export function orphanNoticeDescription(blockId: string, removalDueAt: number): string {
  const removalDate = new Date(removalDueAt).toISOString().slice(0, 10);

  return (
    'This task was created by Obsidian Task Sync. It is now orphaned — no matching task exists ' +
    `in Obsidian anymore — and will be removed on ${removalDate} unless it is re-linked before then.\n` +
    bareBlockIdDescription(blockId)
  );
}

/**
 * What a freshly created task's description looks like, and what an orphan notice reverts to. The
 * label makes the caret-prefixed id legible to a user looking at the task in the provider, who has
 * no reason to know what an Obsidian block id is.
 */
export function bareBlockIdDescription(blockId: string): string {
  return `Obsidian Task Sync ID: ^${blockId}`;
}
