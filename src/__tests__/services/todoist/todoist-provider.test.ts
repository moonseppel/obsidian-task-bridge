import { TodoistApiClient, TodoistTask, TodoistUser } from '../../../services/todoist/todoist-api-client';
import { NewTodoistTask } from '../../../services/todoist/todoist-payloads';
import { TodoistProvider } from '../../../services/todoist/todoist-provider';
import { Logger } from '../../../utils/logger';

function todoistTask(overrides: Partial<TodoistTask> = {}): TodoistTask {
  return {
    id: 't1',
    content: 'Buy milk',
    isCompleted: false,
    projectId: 'p1',
    description: '',
    labels: [],
    ...overrides,
  };
}

function providerReturning(user: Partial<TodoistUser>): TodoistProvider {
  const api = {
    fetchUser: (): Promise<TodoistUser> =>
      Promise.resolve({ id: 'user-1', fullName: '', email: '', ...user }),
  } as unknown as TodoistApiClient;

  return new TodoistProvider(api);
}

describe('TodoistProvider', () => {
  it('is named after the provider it talks to', () => {
    expect(providerReturning({}).description.displayName).toBe('Todoist');
  });

  it('reports the connected account id', async () => {
    await expect(providerReturning({ id: 'user-42' }).connect()).resolves.toMatchObject({ id: 'user-42' });
  });

  it('prefers the full name when describing the account', async () => {
    const provider = providerReturning({ fullName: 'Jan Pralle', email: 'jan@example.com' });
    await expect(provider.connect()).resolves.toMatchObject({ displayName: 'Jan Pralle' });
  });

  it('falls back to the email when the account has no full name', async () => {
    const provider = providerReturning({ email: 'jan@example.com' });
    await expect(provider.connect()).resolves.toMatchObject({ displayName: 'jan@example.com' });
  });

  it('falls back to the id when the account has neither name nor email', async () => {
    await expect(providerReturning({ id: 'user-7' }).connect()).resolves.toMatchObject({ displayName: 'user-7' });
  });
});

describe('TodoistProvider task and project mapping', () => {
  function providerOver(api: Partial<TodoistApiClient>): TodoistProvider {
    return new TodoistProvider(api as TodoistApiClient);
  }

  it('presents Todoist projects in provider-neutral shape', async () => {
    const provider = providerOver({
      listProjects: () => Promise.resolve([{ id: 'p1', name: 'Errands', isInbox: false }]),
    });

    await expect(provider.listProjects()).resolves.toEqual([
      { id: 'p1', name: 'Errands', isDefault: false },
    ]);
  });

  it('reports the Inbox as the provider default, without naming Todoist', async () => {
    const provider = providerOver({
      listProjects: () => Promise.resolve([{ id: 'p1', name: 'Inbox', isInbox: true }]),
    });

    await expect(provider.listProjects()).resolves.toEqual([
      { id: 'p1', name: 'Inbox', isDefault: true },
    ]);
  });

  it('renames Todoist "content" to the neutral "title"', async () => {
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([todoistTask()]),
    });

    await expect(provider.listTasks('p1')).resolves.toEqual([
      { id: 't1', title: 'Buy milk', isCompleted: false, projectId: 'p1', description: '', labels: [] },
    ]);
  });

  it('carries the task last-modified time through to the provider-neutral shape', async () => {
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([
          {
            id: 't1',
            content: 'Buy milk',
            updatedAt: 1700000000000,
            isCompleted: false,
            projectId: 'p1',
            description: '',
            labels: [],
          },
        ]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ updatedAt: 1700000000000 }]);
  });

  it('carries the embedded block id through to the provider-neutral shape', async () => {
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([
          {
            id: 't1',
            content: 'Buy milk',
            embeddedBlockId: 'tb-a1b2c3d4',
            isCompleted: false,
            projectId: 'p1',
            description: '',
            labels: [],
          },
        ]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ embeddedBlockId: 'tb-a1b2c3d4' }]);
  });

  it('carries completion state and the current project through to the provider-neutral shape', async () => {
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([todoistTask({ isCompleted: true, projectId: 'p2' })]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ isCompleted: true, projectId: 'p2' }]);
  });

  it('carries the raw description through to the provider-neutral shape', async () => {
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([
          { id: 't1', content: 'Buy milk', isCompleted: false, projectId: 'p1', description: 'Some notes', labels: [] },
        ]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ description: 'Some notes' }]);
  });

  it('strips a child-waiting notice out of the description in the provider-neutral shape', async () => {
    const notice =
      'TaskBridge tried to add a child to this task, but that is not supported by Todoist once the parent is ' +
      'completed. Reopening will allow the child to be synced in the next run. Child task title: Buy milk';
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([
          {
            id: 't1',
            content: 'Parent',
            isCompleted: true,
            projectId: 'p1',
            description: `Some notes\n${notice}`,
            labels: [],
          },
        ]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ description: 'Some notes' }]);
  });

  it('carries labels through to the provider-neutral shape', async () => {
    const provider = providerOver({
      listTasks: () =>
        Promise.resolve([
          {
            id: 't1',
            content: 'Buy milk',
            isCompleted: false,
            projectId: 'p1',
            description: '',
            labels: ['errands', 'urgent'],
          },
        ]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ labels: ['errands', 'urgent'] }]);
  });

  it('sends the description on to the API client when creating a task', async () => {
    const created: Array<string | undefined> = [];
    const provider = providerOver({
      createTask: (task: NewTodoistTask) => {
        created.push(task.description);
        return Promise.resolve(todoistTask({ content: task.content, description: task.description ?? '' }));
      },
    });

    await provider.createTask({ title: 'Buy milk', projectId: 'p1', description: '^tb-a1b2c3d4', isCompleted: false });

    expect(created).toEqual(['^tb-a1b2c3d4']);
  });

  it('sends labels on to the API client when creating a task', async () => {
    const created: Array<readonly string[] | undefined> = [];
    const provider = providerOver({
      createTask: (task: NewTodoistTask) => {
        created.push(task.labels);
        return Promise.resolve(todoistTask({ content: task.content, labels: [...(task.labels ?? [])] }));
      },
    });

    await provider.createTask({ title: 'Buy milk', projectId: 'p1', labels: ['errands', 'urgent'], isCompleted: false });

    expect(created).toEqual([['errands', 'urgent']]);
  });

  it('creates a task from a title and a project', async () => {
    const created: Array<[string, string]> = [];
    const provider = providerOver({
      createTask: (task: NewTodoistTask) => {
        created.push([task.content, task.projectId]);
        return Promise.resolve(todoistTask({ content: task.content, projectId: task.projectId }));
      },
    });

    await expect(provider.createTask({ title: 'Buy milk', projectId: 'p1', isCompleted: false })).resolves.toEqual({
      id: 't1',
      title: 'Buy milk',
      isCompleted: false,
      projectId: 'p1',
      description: '',
      labels: [],
    });
    expect(created).toEqual([['Buy milk', 'p1']]);
  });

  it('sends the parent id on to the API client when creating a nested task', async () => {
    const created: Array<string | undefined> = [];
    const provider = providerOver({
      getTask: () => Promise.resolve(todoistTask({ id: 'parent-1', isCompleted: false })),
      createTask: (task: NewTodoistTask) => {
        created.push(task.parentId);
        return Promise.resolve(todoistTask({ content: task.content, parentId: task.parentId }));
      },
    });

    await provider.createTask({ title: 'Buy milk', projectId: 'p1', parentId: 'parent-1', isCompleted: false });

    expect(created).toEqual(['parent-1']);
  });

  it('carries a task\'s parent id through in provider-neutral shape', async () => {
    const provider = providerOver({
      listTasks: () => Promise.resolve([todoistTask({ parentId: 'parent-1' })]),
    });

    await expect(provider.listTasks('p1')).resolves.toMatchObject([{ parentId: 'parent-1' }]);
  });

  it('updates a title without handing the caller the raw response', async () => {
    const provider = providerOver({
      updateTaskContent: (_id: string, content: string) =>
        Promise.resolve({ id: 't1', content, isCompleted: false, projectId: 'p1', description: '', labels: [] }),
    });

    await expect(provider.updateTaskTitle('t1', 'Buy oat milk')).resolves.toBeUndefined();
  });

  it('sends a description update on to the API client', async () => {
    const updated: Array<[string, string]> = [];
    const provider = providerOver({
      getTask: () => Promise.resolve(todoistTask({ id: 't1' })),
      updateTaskDescription: (id: string, description: string) => {
        updated.push([id, description]);
        return Promise.resolve(todoistTask({ id, description }));
      },
    });

    await expect(provider.updateTaskDescription('t1', 'Now orphaned.\n^tb-a1')).resolves.toBeUndefined();
    expect(updated).toEqual([['t1', 'Now orphaned.\n^tb-a1']]);
  });

  it('keeps a child-waiting notice on a description update, carrying it past the overwrite', async () => {
    const updated: Array<[string, string]> = [];
    const notice = 'TaskBridge tried to add a child to this task, but that is not supported by Todoist once ' +
      'the parent is completed. Reopening will allow the child to be synced in the next run. Child task title: Child';
    const provider = providerOver({
      getTask: () => Promise.resolve(todoistTask({ id: 't1', description: `Old notes\n${notice}` })),
      updateTaskDescription: (id: string, description: string) => {
        updated.push([id, description]);
        return Promise.resolve(todoistTask({ id, description }));
      },
    });

    await provider.updateTaskDescription('t1', 'New notes');

    expect(updated).toEqual([['t1', `New notes\n${notice}`]]);
  });

  it('sends a labels update on to the API client', async () => {
    const updated: Array<[string, readonly string[]]> = [];
    const provider = providerOver({
      updateTaskLabels: (id: string, labels: readonly string[]) => {
        updated.push([id, labels]);
        return Promise.resolve(todoistTask({ id, labels: [...labels] }));
      },
    });

    await expect(provider.updateTaskLabels('t1', ['errands'])).resolves.toBeUndefined();
    expect(updated).toEqual([['t1', ['errands']]]);
  });

  it('completes a task through the dedicated close action', async () => {
    const closed: string[] = [];
    const provider = providerOver({
      completeTask: (id: string) => {
        closed.push(id);
        return Promise.resolve();
      },
    });

    await expect(provider.completeTask('t1')).resolves.toBeUndefined();
    expect(closed).toEqual(['t1']);
  });

  it('reopens a task through the dedicated reopen action', async () => {
    const reopened: string[] = [];
    const provider = providerOver({
      reopenTask: (id: string) => {
        reopened.push(id);
        return Promise.resolve();
      },
    });

    await expect(provider.reopenTask('t1')).resolves.toBeUndefined();
    expect(reopened).toEqual(['t1']);
  });

  it('reparents a task through the dedicated move action', async () => {
    const moved: Array<[string, string | undefined, string]> = [];
    const provider = providerOver({
      moveTask: (id: string, parentId: string | undefined, projectId: string) => {
        moved.push([id, parentId, projectId]);
        return Promise.resolve(todoistTask({ id, parentId }));
      },
    });

    await expect(provider.reparentTask('t1', 'parent-1', 'p1')).resolves.toBeUndefined();
    expect(moved).toEqual([['t1', 'parent-1', 'p1']]);
  });

  it('clears a parent through the same dedicated move action', async () => {
    const moved: Array<string | undefined> = [];
    const provider = providerOver({
      moveTask: (_id: string, parentId: string | undefined) => {
        moved.push(parentId);
        return Promise.resolve(todoistTask({}));
      },
    });

    await expect(provider.reparentTask('t1', undefined, 'p1')).resolves.toBeUndefined();
    expect(moved).toEqual([undefined]);
  });

  it('removes a task by deleting it, since Todoist offers no trash for tasks', async () => {
    const deleted: string[] = [];
    const provider = providerOver({
      deleteTask: (id: string) => {
        deleted.push(id);
        return Promise.resolve();
      },
    });

    await expect(provider.removeTask('t1')).resolves.toBeUndefined();
    expect(deleted).toEqual(['t1']);
  });

  it('presents a task fetched directly by id in provider-neutral shape', async () => {
    const provider = providerOver({
      getTask: () =>
        Promise.resolve(todoistTask()),
    });

    await expect(provider.getTask('t1')).resolves.toEqual({
      id: 't1',
      title: 'Buy milk',
      isCompleted: false,
      projectId: 'p1',
      description: '',
      labels: [],
    });
  });

  it('reports a task the client could not find as undefined', async () => {
    const provider = providerOver({
      getTask: () => Promise.resolve(undefined),
    });

    await expect(provider.getTask('t1')).resolves.toBeUndefined();
  });
});

describe('TodoistProvider creating a task nested under a completed parent', () => {
  function providerOver(api: Partial<TodoistApiClient>): TodoistProvider {
    return new TodoistProvider(api as TodoistApiClient);
  }

  it('never looks the parent up when the task has none', async () => {
    const getTask = jest.fn();
    const provider = providerOver({
      getTask,
      createTask: (task: NewTodoistTask) => Promise.resolve(todoistTask({ content: task.content })),
    });

    await provider.createTask({ title: 'Buy milk', projectId: 'p1', isCompleted: false });

    expect(getTask).not.toHaveBeenCalled();
  });

  it('creates a checked task under an open parent in one call, then completes it', async () => {
    const completed: string[] = [];
    const created: Array<string | undefined> = [];
    const provider = providerOver({
      getTask: () => Promise.resolve(todoistTask({ id: 'parent-1', isCompleted: false })),
      createTask: (task: NewTodoistTask) => {
        created.push(task.parentId);
        return Promise.resolve(todoistTask({ id: 'child-1', content: task.content, parentId: task.parentId }));
      },
      completeTask: (id: string) => {
        completed.push(id);
        return Promise.resolve();
      },
    });

    const result = await provider.createTask({
      title: 'Buy milk',
      projectId: 'p1',
      parentId: 'parent-1',
      isCompleted: true,
    });

    expect(created).toEqual(['parent-1']);
    expect(completed).toEqual(['child-1']);
    expect(result).toMatchObject({ parentId: 'parent-1', isCompleted: true });
  });

  it('creates a checked task under a completed parent top-level, completes it, then moves it under the parent', async () => {
    const calls: string[] = [];
    const provider = providerOver({
      getTask: () => Promise.resolve(todoistTask({ id: 'parent-1', isCompleted: true })),
      createTask: (task: NewTodoistTask) => {
        calls.push(`create:${task.parentId ?? 'none'}`);
        return Promise.resolve(todoistTask({ id: 'child-1', content: task.content, parentId: task.parentId }));
      },
      completeTask: (id: string) => {
        calls.push(`complete:${id}`);
        return Promise.resolve();
      },
      moveTask: (id: string, parentId: string | undefined) => {
        calls.push(`move:${id}:${parentId}`);
        return Promise.resolve(todoistTask({ id, isCompleted: true, parentId }));
      },
    });

    const result = await provider.createTask({
      title: 'Buy milk',
      projectId: 'p1',
      parentId: 'parent-1',
      isCompleted: true,
    });

    expect(calls).toEqual(['create:none', 'complete:child-1', 'move:child-1:parent-1']);
    expect(result).toMatchObject({ parentId: 'parent-1', isCompleted: true });
  });

  it('returns the task as it stands, warning rather than throwing, when completing it after creation fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const provider = providerOver({
      getTask: () => Promise.resolve(todoistTask({ id: 'parent-1', isCompleted: false })),
      createTask: (task: NewTodoistTask) => Promise.resolve(todoistTask({ id: 'child-1', content: task.content })),
      completeTask: () => Promise.reject(new Error('offline')),
    });

    const result = await provider.createTask({
      title: 'Buy milk',
      projectId: 'p1',
      parentId: 'parent-1',
      isCompleted: true,
    });

    expect(result).toMatchObject({ id: 'child-1', isCompleted: false });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns the completed task as it stands, warning rather than throwing, when the move under the completed parent fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const provider = providerOver({
      getTask: () => Promise.resolve(todoistTask({ id: 'parent-1', isCompleted: true })),
      createTask: (task: NewTodoistTask) => Promise.resolve(todoistTask({ id: 'child-1', content: task.content })),
      completeTask: () => Promise.resolve(),
      moveTask: () => Promise.reject(new Error('offline')),
    });

    const result = await provider.createTask({
      title: 'Buy milk',
      projectId: 'p1',
      parentId: 'parent-1',
      isCompleted: true,
    });

    expect(result).toMatchObject({ id: 'child-1', isCompleted: true, parentId: undefined });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('creates nothing at all for an open task under a completed parent, noting it there instead', async () => {
    const createTask = jest.fn();
    const updated: Array<[string, string]> = [];
    const provider = providerOver({
      getTask: () => Promise.resolve(todoistTask({ id: 'parent-1', isCompleted: true, description: 'Notes' })),
      createTask,
      updateTaskDescription: (id: string, description: string) => {
        updated.push([id, description]);
        return Promise.resolve(todoistTask({ id, description }));
      },
    });

    const result = await provider.createTask({
      title: 'Buy milk',
      projectId: 'p1',
      parentId: 'parent-1',
      isCompleted: false,
    });

    expect(result).toBeUndefined();
    expect(createTask).not.toHaveBeenCalled();
    expect(updated).toEqual([
      [
        'parent-1',
        'Notes\nTaskBridge tried to add a child to this task, but that is not supported by Todoist once the ' +
          'parent is completed. Reopening will allow the child to be synced in the next run. Child task title: ' +
          'Buy milk',
      ],
    ]);
  });

  it('removes a stale notice once the same child creates normally under a reopened parent', async () => {
    const notice =
      'TaskBridge tried to add a child to this task, but that is not supported by Todoist once the parent is ' +
      'completed. Reopening will allow the child to be synced in the next run. Child task title: Buy milk';
    const updated: Array<[string, string]> = [];
    const provider = providerOver({
      getTask: () => Promise.resolve(todoistTask({ id: 'parent-1', isCompleted: false, description: `Notes\n${notice}` })),
      createTask: (task: NewTodoistTask) => Promise.resolve(todoistTask({ id: 'child-1', content: task.content, parentId: task.parentId })),
      updateTaskDescription: (id: string, description: string) => {
        updated.push([id, description]);
        return Promise.resolve(todoistTask({ id, description }));
      },
    });

    const result = await provider.createTask({
      title: 'Buy milk',
      projectId: 'p1',
      parentId: 'parent-1',
      isCompleted: false,
    });

    expect(result).toMatchObject({ id: 'child-1', parentId: 'parent-1' });
    expect(updated).toEqual([['parent-1', 'Notes']]);
  });
});
