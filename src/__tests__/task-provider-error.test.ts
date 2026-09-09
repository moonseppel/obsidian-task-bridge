import { TaskProviderError, TaskProviderFailure, isTransientFailure } from '../services/task-provider-error';

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
