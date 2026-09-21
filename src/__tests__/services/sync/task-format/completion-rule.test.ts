import {
  PLAIN_COMPLETION,
  completionRuleFor,
  newOpenCheckbox,
} from '../../../../services/sync/task-format/completion-rule';
import { DEFAULT_TASKS_STATUSES } from '../../../../services/tasks-plugin/tasks-statuses';
import { TodoistStateMapping } from '../../../../services/todoist/todoist-state-mapping';

function ruleMapping(stored: Record<string, string>): ReturnType<typeof completionRuleFor> {
  const mapping = new TodoistStateMapping(() => Promise.resolve());
  mapping.restore(stored);

  return completionRuleFor(DEFAULT_TASKS_STATUSES, (symbol) => mapping.isCompleted(symbol));
}

describe('PLAIN_COMPLETION', () => {
  it('reads a blank checkbox as open', () => {
    expect(PLAIN_COMPLETION.readsAsDone(' ')).toBe(false);
  });

  it.each(['x', 'X', '/', '-'])('reads [%s] as done', (checkbox) => {
    expect(PLAIN_COMPLETION.readsAsDone(checkbox)).toBe(true);
  });

  it.each([
    [true, 'x'],
    [false, ' '],
  ])('writes done %s as [%s]', (done, checkbox) => {
    expect(PLAIN_COMPLETION.checkboxFor(done)).toBe(checkbox);
  });
});

describe('completionRuleFor', () => {
  describe('with the default mapping', () => {
    it.each(['x', '/', '-'])('reads the status [%s] as done', (checkbox) => {
      expect(ruleMapping({}).readsAsDone(checkbox)).toBe(true);
    });

    it('reads a character the Tasks plugin does not define other than a blank as done', () => {
      expect(ruleMapping({}).readsAsDone('X')).toBe(true);
    });

    it.each([
      [true, 'x'],
      [false, ' '],
    ])('writes done %s as [%s]', (done, checkbox) => {
      expect(ruleMapping({}).checkboxFor(done)).toBe(checkbox);
    });
  });

  it('reads a status mapped to open as open', () => {
    expect(ruleMapping({ '/': 'open' }).readsAsDone('/')).toBe(false);
  });

  it('reads a character the Tasks plugin does not define by the default, whatever is stored for it', () => {
    expect(ruleMapping({ '?': 'open' }).readsAsDone('?')).toBe(true);
  });

  it('writes a completion as the first completed status once [x] is mapped to open', () => {
    expect(ruleMapping({ x: 'open' }).checkboxFor(true)).toBe('/');
  });

  it('writes a reopening as the first open status once a blank is mapped to completed', () => {
    expect(ruleMapping({ ' ': 'completed', '/': 'open' }).checkboxFor(false)).toBe('/');
  });

  it('writes no completion when no status is mapped to completed', () => {
    expect(ruleMapping({ x: 'open', '/': 'open', '-': 'open' }).checkboxFor(true)).toBeUndefined();
  });
});

describe('newOpenCheckbox', () => {
  it('writes a new open line as the status the rule writes for open', () => {
    expect(newOpenCheckbox(ruleMapping({ ' ': 'completed', '/': 'open' }))).toBe('/');
  });

  it('writes a new open line with a blank checkbox when no status stands for open', () => {
    expect(newOpenCheckbox(ruleMapping({ ' ': 'completed' }))).toBe(' ');
  });
});
