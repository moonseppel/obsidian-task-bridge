import { HttpResponse } from '../services/http/http-client';
import { TaskProviderError } from '../services/task-provider-error';
import {
  clientReplying,
  page,
  sentRequest,
} from './support/todoist-client-harness';

describe('TodoistApiClient reads', () => {
  describe('listProjects', () => {
    it('reads the project list from the v1 projects endpoint', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 'p1', name: 'Errands', inbox_project: false }])),
      );

      await expect(context.client.listProjects()).resolves.toEqual([
        { id: 'p1', name: 'Errands', isInbox: false },
      ]);
      expect(sentRequest(context).url).toContain('https://api.todoist.com/api/v1/projects?');
    });

    it('marks the Inbox, which is what the plugin falls back to', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 'p1', name: 'Inbox', inbox_project: true }])),
      );

      await expect(context.client.listProjects()).resolves.toEqual([
        { id: 'p1', name: 'Inbox', isInbox: true },
      ]);
    });

    it('treats a project with no inbox flag as an ordinary one', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 'p1', name: 'Errands' }])));

      await expect(context.client.listProjects()).resolves.toEqual([
        { id: 'p1', name: 'Errands', isInbox: false },
      ]);
    });

    it('rejects a project entry with no id rather than syncing into nowhere', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ name: 'Nameless' }])));

      await expect(context.client.listProjects()).rejects.toBeInstanceOf(TaskProviderError);
    });
  });

  describe('listTasks', () => {
    it('scopes the request to the requested project', async () => {
      const context = clientReplying(() => Promise.resolve(page([])));
      await context.client.listTasks('p1');

      expect(sentRequest(context).url).toContain('project_id=p1');
    });

    it('follows next_cursor until the list is exhausted', async () => {
      const pages = [
        page([{ id: 't1', content: 'One' }], 'cursor-2'),
        page([{ id: 't2', content: 'Two' }]),
      ];
      const context = clientReplying(() => Promise.resolve(pages.shift() as HttpResponse));

      await expect(context.client.listTasks('p1')).resolves.toEqual([
        { id: 't1', content: 'One', isCompleted: false, projectId: '', description: '', labels: [] },
        { id: 't2', content: 'Two', isCompleted: false, projectId: '', description: '', labels: [] },
      ]);
      expect(context.send.mock.calls[1][0].url).toContain('cursor=cursor-2');
    });

    // Todoist answers an unknown project with an empty list, so absence cannot be detected here.
    // The sync tells an empty project from a deleted one by checking the project list instead.
    it('returns nothing for a project with no tasks', async () => {
      const context = clientReplying(() => Promise.resolve(page([])));

      await expect(context.client.listTasks('p1')).resolves.toEqual([]);
    });

    it('strips a line break out of a title so it cannot split a markdown line', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 't1', content: 'One\nTwo' }])));

      await expect(context.client.listTasks('p1')).resolves.toEqual([
        { id: 't1', content: 'One Two', isCompleted: false, projectId: '', description: '', labels: [] },
      ]);
    });

    it('gives up if the server never stops handing back a cursor', async () => {
      const context = clientReplying(() => Promise.resolve(page([], 'always-more')));

      await expect(context.client.listTasks('p1')).rejects.toMatchObject({ failure: 'unexpected' });
    });

    it('exposes a valid updated_at as epoch ms', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', updated_at: '2024-01-02T03:04:05.000Z' }])),
      );

      await expect(context.client.listTasks('p1')).resolves.toMatchObject([
        { updatedAt: Date.parse('2024-01-02T03:04:05.000Z') },
      ]);
    });

    it('leaves updatedAt undefined when updated_at is missing', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 't1', content: 'One' }])));

      const [task] = await context.client.listTasks('p1');
      expect(task.updatedAt).toBeUndefined();
    });

    it('leaves updatedAt undefined when updated_at cannot be parsed as a date', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', updated_at: 'not-a-date' }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.updatedAt).toBeUndefined();
    });

    it('finds a block id embedded at the end of the description', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', description: '^tb-a1b2c3d4' }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.embeddedBlockId).toBe('tb-a1b2c3d4');
    });

    it('finds a block id buried mid-description after a user edit', async () => {
      const context = clientReplying(() =>
        Promise.resolve(
          page([
            {
              id: 't1',
              content: 'One',
              description: 'Some notes\n^tb-a1b2c3d4\nMore notes added afterward',
            },
          ]),
        ),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.embeddedBlockId).toBe('tb-a1b2c3d4');
    });

    it('takes the footer\'s block id over one carried by the description text above it', async () => {
      const context = clientReplying(() =>
        Promise.resolve(
          page([
            {
              id: 't1',
              content: 'One',
              description: '- [ ] direct grandchild ^tb-e5f6g7h8\n\nTaskBridge ID: ^tb-a1b2c3d4',
            },
          ]),
        ),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.embeddedBlockId).toBe('tb-a1b2c3d4');
    });

    it('leaves embeddedBlockId undefined when the description carries no block id', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', description: 'Just some notes' }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.embeddedBlockId).toBeUndefined();
    });

    it('leaves embeddedBlockId undefined when there is no description at all', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 't1', content: 'One' }])));

      const [task] = await context.client.listTasks('p1');
      expect(task.embeddedBlockId).toBeUndefined();
    });

    it('reads checked as isCompleted', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', checked: true }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.isCompleted).toBe(true);
    });

    it('treats a missing checked field as not completed', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 't1', content: 'One' }])));

      const [task] = await context.client.listTasks('p1');
      expect(task.isCompleted).toBe(false);
    });

    it('reads project_id as projectId', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', project_id: 'p9' }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.projectId).toBe('p9');
    });

    it('leaves projectId empty when project_id is missing', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 't1', content: 'One' }])));

      const [task] = await context.client.listTasks('p1');
      expect(task.projectId).toBe('');
    });

    it('reads parent_id as parentId', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', parent_id: 'p9' }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.parentId).toBe('p9');
    });

    it('leaves parentId undefined for a top-level task, unlike projectId which defaults to empty', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', parent_id: null }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.parentId).toBeUndefined();
    });

    it('carries the raw description through, preserving its newlines', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', description: 'Some notes\nAcross two lines' }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.description).toBe('Some notes\nAcross two lines');
    });

    it('leaves the description empty when there is none at all', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 't1', content: 'One' }])));

      const [task] = await context.client.listTasks('p1');
      expect(task.description).toBe('');
    });

    it('carries labels through', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', labels: ['errands', 'urgent'] }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.labels).toEqual(['errands', 'urgent']);
    });

    it('reports no labels when there are none', async () => {
      const context = clientReplying(() => Promise.resolve(page([{ id: 't1', content: 'One' }])));

      const [task] = await context.client.listTasks('p1');
      expect(task.labels).toEqual([]);
    });

    it('drops a non-string entry from a malformed labels array', async () => {
      const context = clientReplying(() =>
        Promise.resolve(page([{ id: 't1', content: 'One', labels: ['errands', 42, null] }])),
      );

      const [task] = await context.client.listTasks('p1');
      expect(task.labels).toEqual(['errands']);
    });
  });
});
