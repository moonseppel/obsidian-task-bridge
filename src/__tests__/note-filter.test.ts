import { filterNotePaths } from '../utils/note-filter';

describe('filterNotePaths', () => {
  const paths = ['Inbox.md', 'projects/Tasks.md', 'archive/tasks-2024.md', 'Notes/Ideas.md'];

  it('returns every path (case-insensitively sorted) for an empty query', () => {
    expect(filterNotePaths(paths, '', 10)).toEqual([
      'archive/tasks-2024.md',
      'Inbox.md',
      'Notes/Ideas.md',
      'projects/Tasks.md',
    ]);
  });

  it('matches case-insensitively on any part of the path', () => {
    expect(filterNotePaths(paths, 'TASKS', 10)).toEqual([
      'archive/tasks-2024.md',
      'projects/Tasks.md',
    ]);
  });

  it('excludes paths that do not contain the query', () => {
    expect(filterNotePaths(paths, 'inbox', 10)).toEqual(['Inbox.md']);
  });

  it('caps the result at the requested limit', () => {
    expect(filterNotePaths(paths, '', 2)).toEqual(['archive/tasks-2024.md', 'Inbox.md']);
  });

  it('returns nothing when no path matches', () => {
    expect(filterNotePaths(paths, 'nonexistent', 10)).toEqual([]);
  });
});
