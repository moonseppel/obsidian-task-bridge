import { NewTask, ProviderAccount, ProviderProject, ProviderTask, TaskProvider } from '../../services/task-provider';

/** A test only has to spell out the fields a scenario actually cares about; the rest default in. */
export type LooseProviderTask = Pick<ProviderTask, 'id' | 'title'> & Partial<Omit<ProviderTask, 'id' | 'title'>>;

export interface StubProviderOptions {
  connect?: () => Promise<ProviderAccount>;
  listProjects?: () => Promise<ProviderProject[]>;
  listTasks?: (projectId: string) => Promise<LooseProviderTask[]>;
  createTask?: (task: NewTask) => Promise<LooseProviderTask>;
  updateTaskTitle?: (taskId: string, title: string) => Promise<void>;
  updateTaskDescription?: (taskId: string, description: string) => Promise<void>;
  updateTaskLabels?: (taskId: string, labels: readonly string[]) => Promise<void>;
  completeTask?: (taskId: string) => Promise<void>;
  reopenTask?: (taskId: string) => Promise<void>;
  removeTask?: (taskId: string) => Promise<void>;
  getTask?: (taskId: string) => Promise<LooseProviderTask | undefined>;
}

const NOT_STUBBED = (name: string) => (): never => {
  throw new Error(`${name} was called but this stub does not implement it.`);
};

function withTaskDefaults(task: LooseProviderTask): ProviderTask {
  return { isCompleted: false, projectId: '', description: '', labels: [], ...task };
}

/** Every port method, so a test only has to spell out the ones it actually exercises. */
export function stubProvider(options: StubProviderOptions = {}): TaskProvider {
  return {
    description: { displayName: 'Todoist', defaultProjectName: 'Inbox' },
    connect: options.connect ?? NOT_STUBBED('connect'),
    listProjects: options.listProjects ?? NOT_STUBBED('listProjects'),
    listTasks: options.listTasks
      ? (projectId) => options.listTasks!(projectId).then((tasks) => tasks.map(withTaskDefaults))
      : NOT_STUBBED('listTasks'),
    createTask: options.createTask
      ? (task) => options.createTask!(task).then(withTaskDefaults)
      : NOT_STUBBED('createTask'),
    updateTaskTitle: options.updateTaskTitle ?? NOT_STUBBED('updateTaskTitle'),
    updateTaskDescription: options.updateTaskDescription ?? NOT_STUBBED('updateTaskDescription'),
    updateTaskLabels: options.updateTaskLabels ?? NOT_STUBBED('updateTaskLabels'),
    completeTask: options.completeTask ?? NOT_STUBBED('completeTask'),
    reopenTask: options.reopenTask ?? NOT_STUBBED('reopenTask'),
    removeTask: options.removeTask ?? NOT_STUBBED('removeTask'),
    getTask: options.getTask
      ? (taskId) => options.getTask!(taskId).then((task) => (task === undefined ? undefined : withTaskDefaults(task)))
      : NOT_STUBBED('getTask'),
  };
}
