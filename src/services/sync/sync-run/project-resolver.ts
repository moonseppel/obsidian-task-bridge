import { ProviderProject, ProviderTask, TaskProvider, defaultProjectOf } from '../../task-provider';

export type ProjectResolution =
  | { kind: 'configured' }
  | { kind: 'defaulted'; project: ProviderProject }
  | { kind: 'replaced'; project: ProviderProject };

export interface ResolvedProject {
  readonly id: string;
  readonly resolution: ProjectResolution;
  readonly tasks: readonly ProviderTask[];
}

export type ProjectTasks = Pick<ResolvedProject, 'id' | 'tasks'>;

/**
 * Syncing must never stall for want of a project, so an unset or vanished one falls back to the
 * provider's default. A project holding tasks plainly exists, so only an empty answer costs a lookup.
 */
export async function resolveProject(provider: TaskProvider, configuredId: string): Promise<ResolvedProject> {
  if (configuredId.length === 0) {
    return fallBackToDefault(provider, 'defaulted');
  }

  const tasks = await provider.listTasks(configuredId);

  if (tasks.length > 0) {
    return { id: configuredId, resolution: { kind: 'configured' }, tasks };
  }

  const projects = await provider.listProjects();

  if (projects.some((project) => project.id === configuredId)) {
    return { id: configuredId, resolution: { kind: 'configured' }, tasks };
  }

  return fallBackToDefault(provider, 'replaced', projects);
}

async function fallBackToDefault(
  provider: TaskProvider,
  kind: 'defaulted' | 'replaced',
  known?: readonly ProviderProject[],
): Promise<ResolvedProject> {
  const project = defaultProjectOf(known ?? (await provider.listProjects()));

  return {
    id: project.id,
    resolution: { kind, project },
    tasks: await provider.listTasks(project.id),
  };
}
