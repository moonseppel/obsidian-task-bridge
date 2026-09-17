import { matchesIgnorePattern } from '../../utils/ignore-pattern';

describe('matchesIgnorePattern', () => {
  it('matches a literal file name', () => {
    expect(matchesIgnorePattern('Tasks.md', 'Tasks.md')).toBe(true);
  });

  it('does not match a different file name', () => {
    expect(matchesIgnorePattern('Tasks.md', 'Notes.md')).toBe(false);
  });

  it('matches a wildcard anywhere in the pattern', () => {
    expect(matchesIgnorePattern('Tasks.sync-conflict-20240101.md', '*.sync-conflict-*')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(matchesIgnorePattern('tasks.md', 'TASKS.MD')).toBe(true);
  });

  it('checks each comma-separated pattern independently', () => {
    expect(matchesIgnorePattern('Tasks.md', 'Notes.md, Tasks.md')).toBe(true);
  });

  it('ignores blank entries between commas', () => {
    expect(matchesIgnorePattern('Tasks.md', 'Tasks.md, , ')).toBe(true);
  });

  it('does not match anything for an empty pattern list', () => {
    expect(matchesIgnorePattern('Tasks.md', '')).toBe(false);
  });

  it('escapes regex-special characters in a pattern', () => {
    expect(matchesIgnorePattern('Tasks (1).md', 'Tasks (1).md')).toBe(true);
    expect(matchesIgnorePattern('TasksX1X.md', 'Tasks (1).md')).toBe(false);
  });

  it('requires the whole file name to match, not just part of it', () => {
    expect(matchesIgnorePattern('Archived-Tasks.md', 'Tasks.md')).toBe(false);
  });
});
