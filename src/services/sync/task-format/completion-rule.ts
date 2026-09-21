import { UserStatus } from '../../user-status';

const OPEN_CHECKBOX = ' ';
const DONE_CHECKBOX = 'x';

/** The one place deciding what a task line's checkbox character means for completion, fixed for a run. */
export interface CompletionRule {
  readsAsDone(checkbox: string): boolean;
  /** The character a pulled state is written as; none when no status stands for that state. */
  checkboxFor(done: boolean): string | undefined;
}

/** Without statuses of the user's own, anything but a blank checkbox is done. */
export const PLAIN_COMPLETION: CompletionRule = { readsAsDone: isNotBlank, checkboxFor: usualCheckbox };

/**
 * A status the user defined reads as the provider maps it; any other character is read as it is
 * without statuses. A pulled state keeps being written as `x` or a blank while that still reads as
 * the state pulled, else as the first status mapped to it.
 */
export function completionRuleFor(
  statuses: readonly UserStatus[],
  isCompleted: (symbol: string) => boolean,
): CompletionRule {
  const defined = new Set(statuses.map((status) => status.symbol));
  const readsAsDone = (checkbox: string): boolean =>
    defined.has(checkbox) ? isCompleted(checkbox) : isNotBlank(checkbox);

  return {
    readsAsDone,
    checkboxFor: (done) => [usualCheckbox(done), ...defined].find((symbol) => readsAsDone(symbol) === done),
  };
}

/** A line written anew for an open task: with no status standing for open, a blank is still the likeliest. */
export function newOpenCheckbox(rule: CompletionRule): string {
  return rule.checkboxFor(false) ?? OPEN_CHECKBOX;
}

function usualCheckbox(done: boolean): string {
  return done ? DONE_CHECKBOX : OPEN_CHECKBOX;
}

function isNotBlank(checkbox: string): boolean {
  return checkbox !== OPEN_CHECKBOX;
}
