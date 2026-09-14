export type TaskProviderFailure =
  | 'not-configured'
  | 'project-missing'
  | 'invalid-credentials'
  | 'rate-limited'
  | 'unreachable'
  | 'unexpected';

const FAILURE_MESSAGES: Record<TaskProviderFailure, string> = {
  'not-configured': 'No API token is configured, please provide one to make this plugin work.',
  'project-missing':
    'No project could be found in the task manager to sync tasks into.',
  'invalid-credentials':
    'The task manager rejected the API token as invalid. Please provide a valid token to make this plugin work.',
  'rate-limited':
    'The task manager received too many requests, so syncing is paused for now. ' +
    'It resumes on its own within a few minutes.',
  'unreachable':
    'The task manager could not be reached. Check your internet connection — syncing resumes on its own.',
  'unexpected':
    'The task manager returned a response this plugin does not understand. Please report this with the console output.',
};

const TRANSIENT_FAILURES: readonly TaskProviderFailure[] = ['unreachable', 'rate-limited'];

export function isTransientFailure(failure: TaskProviderFailure): boolean {
  return TRANSIENT_FAILURES.includes(failure);
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
