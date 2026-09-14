import {
  TaskProviderError,
  TaskProviderFailure,
  isTransientFailure,
  needsDailyReminder,
} from '../services/task-provider-error';

describe('TaskProviderError', () => {
  it('carries the failure it stands for', () => {
    expect(new TaskProviderError('rate-limited').failure).toBe('rate-limited');
  });

  it('quotes what the provider said', () => {
    expect(new TaskProviderError('invalid-credentials', 'Unauthorized').message).toContain('(Unauthorized)');
  });

  it('leaves out the quote when the provider said nothing', () => {
    expect(new TaskProviderError('unreachable').message).not.toContain('(');
  });
});

describe('isTransientFailure', () => {
  it.each<TaskProviderFailure>(['unreachable', 'rate-limited'])('treats %s as resolving on its own', (failure) => {
    expect(isTransientFailure(failure)).toBe(true);
  });

  it.each<TaskProviderFailure>(['invalid-credentials', 'unexpected'])('treats %s as needing attention', (failure) => {
    expect(isTransientFailure(failure)).toBe(false);
  });
});

describe('needsDailyReminder', () => {
  it('is true only for a token missing on this device', () => {
    expect(needsDailyReminder('token-missing-on-device')).toBe(true);
  });

  it.each<TaskProviderFailure>([
    'not-configured',
    'project-missing',
    'invalid-credentials',
    'rate-limited',
    'unreachable',
    'unexpected',
  ])('is false for %s', (failure) => {
    expect(needsDailyReminder(failure)).toBe(false);
  });
});
