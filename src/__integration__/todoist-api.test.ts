import { TodoistApiClient, TodoistProject } from '../services/todoist/todoist-api-client';
import { MISSING_TOKEN_MESSAGE, apiToken, hasApiToken } from './api-token';
import { FetchHttpClient } from './fetch-http-client';

const INVALID_TOKEN = '0'.repeat(40);
const UNKNOWN_PROJECT_ID = '6X4Vw2Hfmg73Q2XR';
const describeAgainstTodoist = hasApiToken ? describe : describe.skip;

function clientUsing(token: string): TodoistApiClient {
  return new TodoistApiClient(new FetchHttpClient(), () => token);
}

// One deliberate failure explains the whole situation, instead of every test failing alike.
describe('Todoist API token', () => {
  it('is set, which the integration tests need in order to reach the real API', () => {
    if (!hasApiToken) {
      throw new Error(MISSING_TOKEN_MESSAGE);
    }
  });
});

describeAgainstTodoist('Todoist API', () => {
  it('still answers the user endpoint with an account id', async () => {
    await expect(clientUsing(apiToken).fetchUser()).resolves.toMatchObject({
      id: expect.stringMatching(/\S/) as unknown as string,
    });
  });

  it('still rejects an unknown token as invalid credentials', async () => {
    await expect(clientUsing(INVALID_TOKEN).fetchUser()).rejects.toMatchObject({
      failure: 'invalid-credentials',
    });
  });
});

/**
 * Everything here happens inside a project this suite creates and deletes, so it never touches
 * the account's real tasks and leaves nothing behind.
 */
describeAgainstTodoist('Todoist task round trip', () => {
  const client = clientUsing(apiToken);
  const projectName = `obsidian-task-sync test ${Date.now()}`;
  let project: TodoistProject;

  beforeAll(async () => {
    project = await client.createProject(projectName);
  });

  afterAll(async () => {
    if (project !== undefined) {
      await client.deleteProject(project.id);
    }
  });

  it('lists the project it just created', async () => {
    const projects = await client.listProjects();

    expect(projects.map((entry) => entry.id)).toContain(project.id);
  });

  // The plugin falls back to the Inbox, so it has to stay identifiable in the project list.
  it('still marks exactly one project as the Inbox', async () => {
    const inboxes = (await client.listProjects()).filter((entry) => entry.isInbox);

    expect(inboxes).toHaveLength(1);
    expect(inboxes[0].id).not.toBe(project.id);
  });

  it('creates a task, renames it, and reads the new title back', async () => {
    const created = await client.createTask('Buy milk', project.id);
    expect(created).toMatchObject({ content: 'Buy milk' });

    await client.updateTaskContent(created.id, 'Buy oat milk');
    const tasks = await client.listTasks(project.id);

    expect(tasks).toContainEqual(expect.objectContaining({ id: created.id, content: 'Buy oat milk' }));
  });

  it('updates a task description and reads the new one back', async () => {
    const created = await client.createTask('Buy milk', project.id, '^ots-a1b2c3d4');

    await client.updateTaskDescription(created.id, 'Now orphaned.\n^ots-a1b2c3d4');
    const tasks = await client.listTasks(project.id);
    const task = tasks.find((entry) => entry.id === created.id);

    expect(task?.embeddedBlockId).toBe('ots-a1b2c3d4');
  });

  it('round-trips a block id embedded in the description through a real fetch', async () => {
    const created = await client.createTask('Buy milk', project.id, '^ots-a1b2c3d4');
    const tasks = await client.listTasks(project.id);
    const task = tasks.find((entry) => entry.id === created.id);

    expect(task?.embeddedBlockId).toBe('ots-a1b2c3d4');
  });

  it('carries a parseable last-modified time on a real task', async () => {
    const created = await client.createTask('Buy milk', project.id);
    const tasks = await client.listTasks(project.id);
    const task = tasks.find((entry) => entry.id === created.id);

    expect(task?.updatedAt).toEqual(expect.any(Number));
  });

  it('stops listing a task once it is deleted', async () => {
    const created = await client.createTask('Temporary', project.id);
    await client.deleteTask(created.id);

    const ids = (await client.listTasks(project.id)).map((task) => task.id);
    expect(ids).not.toContain(created.id);
  });

  it('still fetches a task directly by id', async () => {
    const created = await client.createTask('Buy milk', project.id);

    await expect(client.getTask(created.id)).resolves.toMatchObject({ id: created.id, content: 'Buy milk' });
  });

  // Feature 6 depends on this to tell a deleted task from one that merely moved to another project.
  it('still answers a deleted task with undefined rather than an error', async () => {
    const created = await client.createTask('Temporary', project.id);
    await client.deleteTask(created.id);

    await expect(client.getTask(created.id)).resolves.toBeUndefined();
  });

  // The plugin depends on this pair of behaviours to tell an empty project from a deleted one.
  it('still answers an unknown project with an empty task list rather than an error', async () => {
    await expect(client.listTasks(UNKNOWN_PROJECT_ID)).resolves.toEqual([]);
  });

  it('still refuses to create a task in an unknown project', async () => {
    await expect(client.createTask('Nowhere', UNKNOWN_PROJECT_ID)).rejects.toMatchObject({
      failure: 'project-missing',
    });
  });

  // Feature 7 depends on this whole group to tell "completed" apart from "deleted" or "moved".
  describe('completing and reopening a task', () => {
    it('drops a completed task from the active list, exactly like a deleted one', async () => {
      const created = await client.createTask('Temporary', project.id);
      await client.completeTask(created.id);

      const ids = (await client.listTasks(project.id)).map((task) => task.id);
      expect(ids).not.toContain(created.id);
    });

    it('still answers a completed task with isCompleted true, not deleted', async () => {
      const created = await client.createTask('Temporary', project.id);
      await client.completeTask(created.id);

      await expect(client.getTask(created.id)).resolves.toMatchObject({
        id: created.id,
        isCompleted: true,
      });
    });

    it('carries the project id through on a completed task, so a move can still be told apart', async () => {
      const created = await client.createTask('Temporary', project.id);
      await client.completeTask(created.id);

      await expect(client.getTask(created.id)).resolves.toMatchObject({ projectId: project.id });
    });

    it('bumps the last-modified time when completing a task', async () => {
      const created = await client.createTask('Temporary', project.id);
      const before = (await client.getTask(created.id))?.updatedAt;

      await client.completeTask(created.id);

      const after = (await client.getTask(created.id))?.updatedAt;
      expect(after).toEqual(expect.any(Number));
      expect(after).not.toBe(before);
    });

    it('reopens a completed task back onto the active list', async () => {
      const created = await client.createTask('Temporary', project.id);
      await client.completeTask(created.id);
      await client.reopenTask(created.id);

      const ids = (await client.listTasks(project.id)).map((task) => task.id);
      expect(ids).toContain(created.id);
      await expect(client.getTask(created.id)).resolves.toMatchObject({ isCompleted: false });
    });
  });

  // Feature 7 depends on this to sync a tag as a label without a separate "create the label" step.
  describe('assigning a label Todoist has never seen before', () => {
    it('accepts it rather than failing, and echoes it back on the task', async () => {
      const created = await client.createTask('Temporary', project.id);
      const label = `ots-probe-${Date.now()}`;

      await client.updateTaskLabels(created.id, [label]);

      await expect(client.getTask(created.id)).resolves.toMatchObject({ labels: [label] });
    });

    it('keeps it listed on a fresh fetch of the task', async () => {
      const created = await client.createTask('Temporary', project.id);
      const label = `ots-probe-${Date.now()}`;
      await client.updateTaskLabels(created.id, [label]);

      const tasks = await client.listTasks(project.id);
      const task = tasks.find((entry) => entry.id === created.id);

      expect(task?.labels).toEqual([label]);
    });
  });

  // Feature 7's tag sync depends on both of these: a label Obsidian can't write as a #tag must be
  // left alone rather than mangled, and a duplicate the note might carry must not cause an
  // endless push once Todoist has already collapsed it on its own side.
  describe('labels that do not map cleanly onto Obsidian tags', () => {
    it('accepts a label containing a space, which no #tag syntax can represent', async () => {
      const created = await client.createTask('Temporary', project.id);
      const label = `ots probe ${Date.now()}`;

      await client.updateTaskLabels(created.id, [label]);

      await expect(client.getTask(created.id)).resolves.toMatchObject({ labels: [label] });
    });

    it('silently collapses an exact-case duplicate within the same label list', async () => {
      const created = await client.createTask('Temporary', project.id);
      const label = `ots-dup-${Date.now()}`;

      await client.updateTaskLabels(created.id, [label, label]);

      await expect(client.getTask(created.id)).resolves.toMatchObject({ labels: [label] });
    });
  });
});
