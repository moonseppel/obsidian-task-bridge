/**
 * Fails the integration run before any test executes when the live Todoist token is absent.
 * These tests exist to catch changes in the real Todoist API, so skipping them silently
 * would leave that guard permanently unarmed.
 */

const MISSING_TOKEN_MESSAGE = [
  'OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN is not set, so the Todoist integration tests cannot run.',
  'These tests call the real Todoist API and are part of `npm test`.',
  'Create a token in Todoist under Settings -> Integrations -> Developer, then run:',
  '  OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN=<your token> npm test',
  'Run `npm run test:unit` for the offline suite alone. Never commit the token.',
].join('\n');

module.exports = function requireTodoistToken() {
  const token = process.env.OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN || '';

  if (token.trim().length === 0) {
    throw new Error(MISSING_TOKEN_MESSAGE);
  }
};
