/**
 * The integration tests exist to catch changes in the real Todoist API, so a missing token
 * fails the run rather than quietly skipping it. The suites below are skipped only because
 * one deliberate failure says why, which keeps the output short without disarming the guard.
 */
const RULE = '─'.repeat(78);

export const MISSING_TOKEN_MESSAGE = [
  '',
  RULE,
  '  The Todoist integration tests cannot run: no API token in this shell.',
  RULE,
  '',
  '  These tests call the real Todoist API and are part of `npm test`. Nothing is',
  '  wrong with your code, and the offline suite above ran normally.',
  '',
  '  Pick whichever fits:',
  '',
  '    npm run test:unit',
  '        Run the offline suite alone. No token needed.',
  '',
  '    OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN=<your token> npm test',
  '        Run everything once, without storing the token anywhere.',
  '',
  '    export OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN=<your token>',
  '        Set it for this terminal, then run `npm test` as often as you like.',
  '',
  '  Already added it to ~/.zshrc? A terminal opened before that edit does not have',
  '  it. Open a new one, or run `source ~/.zshrc` here. The same applies to your',
  '  editor: it passes its own environment to the pre-commit hook, so restart it if',
  '  committing fails for this reason.',
  '',
  '  Get a token in Todoist under Settings -> Integrations -> Developer.',
  '  Never commit it.',
  RULE,
  '',
].join('\n');

export const apiToken = (process.env.OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN ?? '').trim();
export const hasApiToken = apiToken.length > 0;
