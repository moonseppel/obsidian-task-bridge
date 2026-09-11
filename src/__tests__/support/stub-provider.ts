import { NewTask, ProviderAccount, ProviderProject, ProviderTask, TaskProvider } from '../../services/task-provider';

export interface StubProviderOptions {
  connect?: () => Promise<ProviderAccount>;
  listProjects?: () => Promise<ProviderProject[]>;
  listTasks?: (projectId: string) => Promise<ProviderTask[]>;
  createTask?: (task: NewTask) => Promise<ProviderTask>;
  updateTaskTitle?: (taskId: string, title: string) => Promise<void>;
}

const NOT_STUBBED = (name: string) => (): never => {
  throw new Error(`${name} was called but this stub does not implement it.`);
};

/** Every port method, so a test only has to spell out the ones it actually exercises. */
export function stubProvider(options: StubProviderOptions = {}): TaskProvider {
  return {
    description: { displayName: 'Todoist', defaultProjectName: 'Inbox' },
    connect: options.connect ?? NOT_STUBBED('connect'),
    listProjects: options.listProjects ?? NOT_STUBBED('listProjects'),
    listTasks: options.listTasks ?? NOT_STUBBED('listTasks'),
    createTask: options.createTask ?? NOT_STUBBED('createTask'),
    updateTaskTitle: options.updateTaskTitle ?? NOT_STUBBED('updateTaskTitle'),
  };
}
