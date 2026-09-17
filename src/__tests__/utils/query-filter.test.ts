import { filterByQuery } from '../../utils/query-filter';

describe('filterByQuery', () => {
  const paths = ['Inbox.md', 'projects/Tasks.md', 'archive/tasks-2024.md', 'Notes/Ideas.md'];

  it('returns every value (case-insensitively sorted) for an empty query', () => {
    expect(filterByQuery(paths, '', 10)).toEqual([
      'archive/tasks-2024.md',
      'Inbox.md',
      'Notes/Ideas.md',
      'projects/Tasks.md',
    ]);
  });

  it('matches case-insensitively on any part of the value', () => {
    expect(filterByQuery(paths, 'TASKS', 10)).toEqual(['archive/tasks-2024.md', 'projects/Tasks.md']);
  });

  it('excludes values that do not contain the query', () => {
    expect(filterByQuery(paths, 'inbox', 10)).toEqual(['Inbox.md']);
  });

  it('caps the result at the requested limit', () => {
    expect(filterByQuery(paths, '', 2)).toEqual(['archive/tasks-2024.md', 'Inbox.md']);
  });

  it('returns nothing when no value matches', () => {
    expect(filterByQuery(paths, 'nonexistent', 10)).toEqual([]);
  });
});
