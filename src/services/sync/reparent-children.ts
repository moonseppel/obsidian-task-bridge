import { ProviderTask, TaskProvider } from '../task-provider';

/**
 * Removing a task cascades to its descendants on the provider side (a discovered Todoist
 * behavior, documented in claude.md/gemini.md), which would silently take down any child still
 * linked to a line in the note. Every direct child is promoted to top-level first, so the
 * following pass's ordinary parent-field sync is the only thing that ever decides where it
 * settles — recursing isn't needed, since a grandchild's own parent is the child, not the task
 * being removed, and the child keeps its whole subtree intact once it is no longer nested under it.
 */
export async function promoteChildrenToTopLevel(
  provider: TaskProvider,
  tasks: readonly ProviderTask[],
  parentTaskId: string,
  projectId: string,
): Promise<void> {
  for (const child of tasks) {
    if (child.parentId === parentTaskId) {
      await provider.reparentTask(child.id, undefined, projectId);
    }
  }
}
