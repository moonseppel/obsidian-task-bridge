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
  reparentTask?: (taskId: string, parentId: string | undefined, projectId: string) => Promise<void>;
  removeTask?: (taskId: string) => Promise<void>;
  getTask?: (taskId: string) => Promise<LooseProviderTask | undefined>;
  /** Left out by a stub standing in for a provider that stores a description exactly as given. */
  storedDescription?: (description: string) => string;
}

/** Every port method, so a test only has to spell out the ones it actually exercises. */
export function stubProvider(options: StubProviderOptions = {}): TaskProvider {
  const { listTasks, createTask, getTask } = options;

  return {
    description: { displayName: 'Todoist', defaultProjectName: 'Inbox' },
    storedDescription: options.storedDescription,
    connect: options.connect ?? notStubbed('connect'),
    listProjects: options.listProjects ?? notStubbed('listProjects'),
    listTasks: listTasks
      ? (projectId) => listTasks(projectId).then((tasks) => tasks.map(withTaskDefaults))
      : notStubbed('listTasks'),
    createTask: createTask ? (task) => createTask(task).then(withTaskDefaults) : notStubbed('createTask'),
    updateTaskTitle: options.updateTaskTitle ?? notStubbed('updateTaskTitle'),
    updateTaskDescription: options.updateTaskDescription ?? notStubbed('updateTaskDescription'),
    updateTaskLabels: options.updateTaskLabels ?? notStubbed('updateTaskLabels'),
    completeTask: options.completeTask ?? notStubbed('completeTask'),
    reopenTask: options.reopenTask ?? notStubbed('reopenTask'),
    reparentTask: options.reparentTask ?? notStubbed('reparentTask'),
    removeTask: options.removeTask ?? notStubbed('removeTask'),
    getTask: getTask
      ? (taskId) => getTask(taskId).then((task) => (task === undefined ? undefined : withTaskDefaults(task)))
      : notStubbed('getTask'),
  };
}

function notStubbed(name: string): () => never {
  return () => {
    throw new Error(`${name} was called but this stub does not implement it.`);
  };
}

function withTaskDefaults(task: LooseProviderTask): ProviderTask {
  return { isCompleted: false, projectId: '', description: '', labels: [], ...task };
}
