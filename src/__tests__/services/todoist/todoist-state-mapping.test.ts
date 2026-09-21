import { DropdownComponent } from 'obsidian';
import { TodoistStateMapping } from '../../../services/todoist/todoist-state-mapping';

const IN_PROGRESS = { symbol: '/', name: 'In Progress' };
const CONTAINER = {} as HTMLElement;

function mappingStored(stored: unknown): TodoistStateMapping {
  const mapping = new TodoistStateMapping(() => Promise.resolve());
  mapping.restore(stored);
  return mapping;
}

/** Changes the dropdown of the only row drawn, the way picking an entry in it does. */
async function choose(mapping: TodoistStateMapping, state: string): Promise<void> {
  const onChange = jest.spyOn(DropdownComponent.prototype, 'onChange');
  mapping.display(CONTAINER, [IN_PROGRESS]);
  await onChange.mock.calls[0][0](state);
}

describe('TodoistStateMapping', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('by default', () => {
    it('maps a blank checkbox to open', () => {
      expect(mappingStored(undefined).isCompleted(' ')).toBe(false);
    });

    it.each(['x', '/', '-'])('maps [%s] to completed', (symbol) => {
      expect(mappingStored(undefined).isCompleted(symbol)).toBe(true);
    });

    it('stores nothing', () => {
      expect(mappingStored(undefined).toStored()).toEqual({});
    });
  });

  it.each([
    ['/', 'open', false],
    [' ', 'completed', true],
    ['x', 'open', false],
  ])('maps [%s] as stored to %s', (symbol, state, completed) => {
    expect(mappingStored({ [symbol]: state }).isCompleted(symbol)).toBe(completed);
  });

  it.each([
    ['a key longer than one character', { xx: 'open' }],
    ['a state Todoist does not have', { '/': 'deferred' }],
    ['a state that is not text', { '/': true }],
  ])('ignores %s in the stored data', (_case, stored) => {
    expect(mappingStored(stored).toStored()).toEqual({});
  });

  it('ignores stored data that is not an object', () => {
    expect(mappingStored('open').toStored()).toEqual({});
  });

  it('keeps a choice for a status that is no longer defined', () => {
    expect(mappingStored({ '?': 'open' }).toStored()).toEqual({ '?': 'open' });
  });

  describe('choosing in the settings', () => {
    it('draws one row per status, preset to its current state', () => {
      const setValue = jest.spyOn(DropdownComponent.prototype, 'setValue');

      mappingStored({ '/': 'open' }).display(CONTAINER, [IN_PROGRESS, { symbol: 'x', name: 'Done' }]);

      expect(setValue.mock.calls.map((call) => call[0])).toEqual(['open', 'completed']);
    });

    it('applies a changed choice', async () => {
      const mapping = mappingStored(undefined);

      await choose(mapping, 'open');

      expect(mapping.isCompleted('/')).toBe(false);
    });

    it('saves a changed choice', async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const mapping = new TodoistStateMapping(save);

      await choose(mapping, 'open');

      expect(save).toHaveBeenCalledTimes(1);
    });

    it('stores nothing for a status set back to its default', async () => {
      const mapping = mappingStored({ '/': 'open' });

      await choose(mapping, 'completed');

      expect(mapping.toStored()).toEqual({});
    });
  });
});
