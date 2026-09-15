import { formatTaskLine, parseTaskLine } from './task-line';
import { taskLineNumbers } from './task-tree';

/** What appending a block id to one line of a note either did or found already true. */
export interface AnchorWrite {
  readonly content: string;
  /** False when the line already moved on — no longer a bare, anchor-less task line. */
  readonly appended: boolean;
}

/**
 * Appends a block id to the line at this position, but only while doing so still makes sense: the
 * line must still be a task line, not description text, carrying no block id, or already carrying this exact one
 * (a block id reused from the note rather than freshly minted counts as already anchored, not as
 * having moved on). This way a task line whose creation raced a concurrent edit still gets its
 * anchor as long as the line is still recognizably the same, anchor-less task, whatever else about
 * it (its title, say) changed in the meantime. See architecture-rules.md rule 38.
 */
export function appendAnchorToLine(content: string, lineNumber: number, blockId: string): AnchorWrite {
  const lines = content.split('\n');
  const task = taskLineNumbers(lines).has(lineNumber) ? parseTaskLine(lines[lineNumber]) : undefined;

  if (task === undefined || (task.blockId !== undefined && task.blockId !== blockId)) {
    return { content, appended: false };
  }

  if (task.blockId === blockId) {
    return { content, appended: true };
  }

  lines[lineNumber] = formatTaskLine({ ...task, blockId });

  return { content: lines.join('\n'), appended: true };
}
