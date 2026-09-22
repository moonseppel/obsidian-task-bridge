export type TaskProviderFailure =
  | 'not-configured'
  | 'token-missing-on-device'
  | 'project-missing'
  | 'invalid-credentials'
  | 'rate-limited'
  | 'unreachable'
  | 'server-error'
  | 'unexpected';

const FAILURE_MESSAGES: Record<TaskProviderFailure, string> = {
  'not-configured': 'No API token is configured, please provide one to make this plugin work.',
  'token-missing-on-device':
    'A Todoist token is set up on another device, but not this one — every device needs its own copy. ' +
    'Add it in the plugin settings.',
  'project-missing':
    'No project could be found in the task manager to sync tasks into.',
  'invalid-credentials':
    'The task manager rejected the API token as invalid. Please provide a valid token to make this plugin work.',
  'rate-limited':
    'The task manager received too many requests, so syncing is paused for now. ' +
    'It resumes on its own within a few minutes.',
  'unreachable':
    'The task manager could not be reached. Check your internet connection — syncing resumes on its own.',
  'server-error':
    'The task manager is having problems right now — syncing resumes on its own.',
  'unexpected':
    'The task manager returned a response this plugin does not understand. Please report this with the console output.',
};

const TRANSIENT_FAILURES: readonly TaskProviderFailure[] = ['unreachable', 'server-error', 'rate-limited'];

export function isTransientFailure(failure: TaskProviderFailure): boolean {
  return TRANSIENT_FAILURES.includes(failure);
}

const DAILY_REMINDER_FAILURES: readonly TaskProviderFailure[] = ['token-missing-on-device'];

/**
 * A failure the user can only fix on this specific device (unlike a revoked token, which is fixed
 * once for everyone) stays true until they notice, so it is reminded on a throttle instead of once
 * per session — but still not on every poll, which would stack up undismissed notices forever.
 */
export function needsDailyReminder(failure: TaskProviderFailure): boolean {
  return DAILY_REMINDER_FAILURES.includes(failure);
}

export class TaskProviderError extends Error {
  readonly failure: TaskProviderFailure;

  constructor(failure: TaskProviderFailure, detail = '') {
    super(detail.length > 0 ? `${FAILURE_MESSAGES[failure]} (${detail})` : FAILURE_MESSAGES[failure]);
    this.name = 'TaskProviderError';
    this.failure = failure;
  }
}

/**
 * A provider failure is one reason whatever detail comes with it, so a flaky connection is not
 * reported anew on every poll; any other error is its own reason, so a second, different bug
 * still shows up rather than being mistaken for a repeat of the first.
 */
export function failureReasonOf(error: unknown): string {
  if (error instanceof TaskProviderError) {
    return error.failure;
  }

  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
