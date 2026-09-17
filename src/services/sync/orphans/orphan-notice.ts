import { composeRemoteDescription } from '../task-format/task-description';

/** Distinctive enough to find the notice line by search, the same way the footer is found. */
const NOTICE_MARKER = 'It is now orphaned —';

/**
 * Built the same way every time, so un-flagging can revert it by discarding the notice while
 * keeping whatever user-authored description the task currently carries — the notice itself is a
 * courtesy only; the removal date it names is never read back, only the plugin's own stored data
 * decides that.
 */
export function orphanNoticeDescription(blockId: string, removalDueAt: number, userText = ''): string {
  const removalDate = new Date(removalDueAt).toISOString().slice(0, 10);
  const notice =
    'This task was created by TaskBridge. ' +
    `${NOTICE_MARKER} no matching task exists in Obsidian anymore — and will be removed on ` +
    `${removalDate} unless it is re-linked before then.`;

  return composeRemoteDescription(userText.length === 0 ? notice : `${userText}\n\n${notice}`, blockId);
}

/** Found by its marker rather than its position, the same way the footer is. */
export function stripOrphanNotice(description: string): string {
  const lines = description.split('\n');
  const noticeIndex = lines.findIndex((line) => line.includes(NOTICE_MARKER));

  if (noticeIndex === -1) {
    return description;
  }

  const before = lines.slice(0, noticeIndex);
  const withoutLeadingBlank = before.length > 0 && before[before.length - 1] === '' ? before.slice(0, -1) : before;
  const after = lines.slice(noticeIndex + 1);
  const withoutTrailingBlank = after.length > 0 && after[0] === '' ? after.slice(1) : after;

  return [...withoutLeadingBlank, ...withoutTrailingBlank].join('\n');
}
