import { Logger } from '../../../utils/logger';
import { TaskProvider } from '../../task-provider';
import { ProjectTasks } from '../sync-run/project-resolver';

const logger = new Logger('TaskBridge:Sync');

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
  project: ProjectTasks,
  parentTaskId: string,
): Promise<void> {
  for (const child of project.tasks) {
    if (child.parentId === parentTaskId) {
      await provider.reparentTask(child.id, undefined, project.id);
      logger.debug('Promoted a sub-task to top-level before its parent is deleted', { taskId: child.id, parentTaskId });
    }
  }
}
