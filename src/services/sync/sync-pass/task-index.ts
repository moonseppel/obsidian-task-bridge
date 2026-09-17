import { ProviderTask } from '../../task-provider';

export function indexTasksById(tasks: readonly ProviderTask[]): Map<string, ProviderTask> {
  return new Map(tasks.map((task): [string, ProviderTask] => [task.id, task]));
}

export function indexTasksByEmbeddedBlockId(tasks: readonly ProviderTask[]): Map<string, ProviderTask> {
  const found = new Map<string, ProviderTask>();

  for (const task of tasks) {
    if (task.embeddedBlockId !== undefined) {
      found.set(task.embeddedBlockId, task);
    }
  }

  return found;
}
