/**
 * The line left on a completed parent's description while one of its children waits to be created,
 * one per held-back child, telling a user reading the task in the provider why nothing synced yet.
 */
const NOTICE_PREFIX =
  'TaskBridge tried to add a child to this task, but that is not supported by Todoist once the parent is ' +
  'completed. Reopening will allow the child to be synced in the next run. Child task title: ';

function noticeLine(title: string): string {
  return `${NOTICE_PREFIX}${title}`;
}

/** Adds the notice for this child's title, unless the description already carries it. */
export function addChildNotice(description: string, title: string): string {
  const line = noticeLine(title);

  if (description.split('\n').includes(line)) {
    return description;
  }

  return description.length === 0 ? line : `${description}\n${line}`;
}

/** Removes the notice for this child's title, leaving everything else exactly as it was. */
export function removeChildNotice(description: string, title: string): string {
  const line = noticeLine(title);

  return description
    .split('\n')
    .filter((current) => current !== line)
    .join('\n');
}

/** Every notice line, so it can be carried along when the sync engine overwrites a description. */
export function childNoticesIn(description: string): readonly string[] {
  return description.split('\n').filter((line) => line.startsWith(NOTICE_PREFIX));
}

/** The description without any notice line, which is all the sync engine is ever shown. */
export function withoutChildNotices(description: string): string {
  return description
    .split('\n')
    .filter((line) => !line.startsWith(NOTICE_PREFIX))
    .join('\n');
}

/** Re-attaches notices the sync engine never saw onto a description it is about to overwrite. */
export function withChildNotices(description: string, notices: readonly string[]): string {
  return [description, ...notices].filter((part) => part.length > 0).join('\n');
}
