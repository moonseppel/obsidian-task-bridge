import { DEFAULT_TASKS_STATUSES, readTasksStatuses } from '../../../services/tasks-plugin/tasks-statuses';

function statusSettings(coreStatuses: unknown, customStatuses: unknown = []): unknown {
  return { statusSettings: { coreStatuses, customStatuses } };
}

describe('readTasksStatuses', () => {
  it("falls back to the Tasks plugin's defaults when its settings carry no statuses", () => {
    expect(readTasksStatuses({ taskFormat: 'tasksPluginEmoji' })).toBe(DEFAULT_TASKS_STATUSES);
  });

  it('reads core statuses before custom ones', () => {
    const settings = statusSettings(
      [{ symbol: ' ', name: 'Todo' }, { symbol: 'x', name: 'Done' }],
      [{ symbol: '>', name: 'Deferred' }],
    );

    expect(readTasksStatuses(settings)).toEqual([
      { symbol: ' ', name: 'Todo' },
      { symbol: 'x', name: 'Done' },
      { symbol: '>', name: 'Deferred' },
    ]);
  });

  it.each([
    ['an empty symbol', { symbol: '', name: 'Nothing' }],
    ['a symbol of two characters', { symbol: 'ab', name: 'Two' }],
    ['a symbol that is not text', { symbol: 1, name: 'Number' }],
    ['an entry that is not an object', 'x'],
  ])('drops %s', (_case, entry) => {
    expect(readTasksStatuses(statusSettings([{ symbol: ' ', name: 'Todo' }, entry]))).toEqual([
      { symbol: ' ', name: 'Todo' },
    ]);
  });

  it('makes a name safe to display', () => {
    expect(readTasksStatuses(statusSettings([{ symbol: '?', name: 'Ask\nsomeone' }]))).toEqual([
      { symbol: '?', name: 'Ask someone' },
    ]);
  });

  it('keeps the first of two statuses sharing a symbol, as the Tasks plugin does', () => {
    const settings = statusSettings([{ symbol: 'x', name: 'Done' }], [{ symbol: 'x', name: 'Also done' }]);

    expect(readTasksStatuses(settings)).toEqual([{ symbol: 'x', name: 'Done' }]);
  });
});
