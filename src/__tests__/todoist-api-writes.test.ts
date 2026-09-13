import {
  clientReplying,
  sentRequest,
} from './support/todoist-client-harness';

describe('TodoistApiClient writes', () => {
  describe('createTask', () => {
    it('posts the title and project as a JSON body', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await expect(context.client.createTask({ content: 'Buy milk', projectId: 'p1' })).resolves.toEqual({
        id: 't1',
        content: 'Buy milk',
        isCompleted: false,
        projectId: '',
        description: '',
        labels: [],
      });

      const request = sentRequest(context);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.todoist.com/api/v1/tasks');
      expect(request.contentType).toBe('application/json');
      expect(JSON.parse(request.body ?? '')).toEqual({ content: 'Buy milk', project_id: 'p1' });
    });

    it('sends the description when one is given', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.createTask({ content: 'Buy milk', projectId: 'p1', description: '^ots-a1b2c3d4' });

      expect(JSON.parse(sentRequest(context).body ?? '')).toEqual({
        content: 'Buy milk',
        project_id: 'p1',
        description: '^ots-a1b2c3d4',
      });
    });

    it('omits the description entirely when none is given', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.createTask({ content: 'Buy milk', projectId: 'p1' });

      expect(JSON.parse(sentRequest(context).body ?? '')).not.toHaveProperty('description');
    });

    it('sends labels when given', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.createTask({ content: 'Buy milk', projectId: 'p1', labels: ['errands', 'urgent'] });

      expect(JSON.parse(sentRequest(context).body ?? '')).toEqual({
        content: 'Buy milk',
        project_id: 'p1',
        labels: ['errands', 'urgent'],
      });
    });

    it('omits labels entirely when none are given', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.createTask({ content: 'Buy milk', projectId: 'p1' });

      expect(JSON.parse(sentRequest(context).body ?? '')).not.toHaveProperty('labels');
    });

    it('reports a deleted project rather than a puzzling error', async () => {
      const context = clientReplying(() => Promise.resolve({ status: 404, text: '{}' }));

      await expect(context.client.createTask({ content: 'Buy milk', projectId: 'p1' })).rejects.toMatchObject({
        failure: 'project-missing',
      });
    });

    it('sends the parent id when creating a nested task', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.createTask({ content: 'Buy milk', projectId: 'p1', parentId: 'parent-1' });

      expect(JSON.parse(sentRequest(context).body ?? '')).toEqual({
        content: 'Buy milk',
        project_id: 'p1',
        parent_id: 'parent-1',
      });
    });

    it('omits the parent id entirely for a top-level task', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.createTask({ content: 'Buy milk', projectId: 'p1' });

      expect(JSON.parse(sentRequest(context).body ?? '')).not.toHaveProperty('parent_id');
    });
  });

  describe('moveTask', () => {
    it('posts the new parent to the dedicated move action', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.moveTask('t1', 'parent-1', 'p1');

      const request = sentRequest(context);
      expect(request.url).toBe('https://api.todoist.com/api/v1/tasks/t1/move');
      expect(JSON.parse(request.body ?? '')).toEqual({ parent_id: 'parent-1' });
    });

    it('clears a parent by re-sending the current project, since a literal null parent is rejected', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.moveTask('t1', undefined, 'p1');

      expect(JSON.parse(sentRequest(context).body ?? '')).toEqual({ project_id: 'p1' });
    });
  });

  describe('updateTaskContent', () => {
    it('posts the new title to the task endpoint', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy oat milk' }) }),
      );

      await context.client.updateTaskContent('t1', 'Buy oat milk');

      const request = sentRequest(context);
      expect(request.url).toBe('https://api.todoist.com/api/v1/tasks/t1');
      expect(JSON.parse(request.body ?? '')).toEqual({ content: 'Buy oat milk' });
    });

    it('escapes a task id so it cannot reshape the request path', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 'x', content: 'x' }) }),
      );

      await context.client.updateTaskContent('../projects/p1', 'Nice try');

      expect(sentRequest(context).url).toBe(
        'https://api.todoist.com/api/v1/tasks/..%2Fprojects%2Fp1',
      );
    });

    it.each([
      [401, 'invalid-credentials'],
      [429, 'rate-limited'],
      [500, 'unreachable'],
      [418, 'unexpected'],
    ])('maps status %s to the %s failure', async (status, failure) => {
      const context = clientReplying(() => Promise.resolve({ status, text: '{}' }));

      await expect(context.client.updateTaskContent('t1', 'x')).rejects.toMatchObject({ failure });
    });
  });

  describe('updateTaskDescription', () => {
    it('posts the new description to the task endpoint', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.updateTaskDescription('t1', 'This task is orphaned.\n^ots-a1b2c3d4');

      const request = sentRequest(context);
      expect(request.url).toBe('https://api.todoist.com/api/v1/tasks/t1');
      expect(JSON.parse(request.body ?? '')).toEqual({
        description: 'This task is orphaned.\n^ots-a1b2c3d4',
      });
    });
  });

  describe('updateTaskLabels', () => {
    it('posts the new labels to the task endpoint', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.updateTaskLabels('t1', ['errands', 'urgent']);

      const request = sentRequest(context);
      expect(request.url).toBe('https://api.todoist.com/api/v1/tasks/t1');
      expect(JSON.parse(request.body ?? '')).toEqual({ labels: ['errands', 'urgent'] });
    });

    it('sends an empty array to clear every label', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await context.client.updateTaskLabels('t1', []);

      expect(JSON.parse(sentRequest(context).body ?? '')).toEqual({ labels: [] });
    });
  });

  describe('deleteTask', () => {
    it('accepts the empty body Todoist returns for a delete', async () => {
      const context = clientReplying(() => Promise.resolve({ status: 204, text: '' }));

      await expect(context.client.deleteTask('t1')).resolves.toBeUndefined();
      expect(sentRequest(context).method).toBe('DELETE');
    });
  });

  describe('completeTask', () => {
    it('posts to the dedicated close action, accepting the empty body Todoist returns', async () => {
      const context = clientReplying(() => Promise.resolve({ status: 204, text: '' }));

      await expect(context.client.completeTask('t1')).resolves.toBeUndefined();
      expect(sentRequest(context).method).toBe('POST');
      expect(sentRequest(context).url).toBe('https://api.todoist.com/api/v1/tasks/t1/close');
    });
  });

  describe('reopenTask', () => {
    it('posts to the dedicated reopen action, accepting the empty body Todoist returns', async () => {
      const context = clientReplying(() => Promise.resolve({ status: 204, text: '' }));

      await expect(context.client.reopenTask('t1')).resolves.toBeUndefined();
      expect(sentRequest(context).method).toBe('POST');
      expect(sentRequest(context).url).toBe('https://api.todoist.com/api/v1/tasks/t1/reopen');
    });
  });

  describe('getTask', () => {
    it('fetches a single task by id', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk' }) }),
      );

      await expect(context.client.getTask('t1')).resolves.toEqual({
        id: 't1',
        content: 'Buy milk',
        isCompleted: false,
        projectId: '',
        description: '',
        labels: [],
      });
      expect(sentRequest(context).url).toBe('https://api.todoist.com/api/v1/tasks/t1');
      expect(sentRequest(context).method).toBe('GET');
    });

    it('reports a task not found by status as undefined rather than throwing', async () => {
      const context = clientReplying(() => Promise.resolve({ status: 404, text: '{}' }));

      await expect(context.client.getTask('t1')).resolves.toBeUndefined();
    });

    it('reports a deleted task as undefined even though Todoist answers it with 200', async () => {
      const context = clientReplying(() =>
        Promise.resolve({ status: 200, text: JSON.stringify({ id: 't1', content: 'Buy milk', is_deleted: true }) }),
      );

      await expect(context.client.getTask('t1')).resolves.toBeUndefined();
    });

    it('still reports other error statuses as failures', async () => {
      const context = clientReplying(() => Promise.resolve({ status: 401, text: '{}' }));

      await expect(context.client.getTask('t1')).rejects.toMatchObject({ failure: 'invalid-credentials' });
    });
  });
});
