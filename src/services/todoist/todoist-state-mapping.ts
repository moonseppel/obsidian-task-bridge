import { Setting } from 'obsidian';
import { Logger } from '../../utils/logger';
import { isRecord } from '../../utils/type-guards';
import { ProviderStateMapping } from '../provider-state-mapping';
import { UserStatus } from '../user-status';

const logger = new Logger('TaskBridge:Todoist');

/** Todoist knows no state of a task but open and completed. */
type TodoistState = 'open' | 'completed';

const STATE_NAMES: Record<TodoistState, string> = { open: 'Open', completed: 'Completed' };

/** A status Todoist has no state of its own for: a blank checkbox is open, anything else completed. */
export function defaultStateFor(symbol: string): TodoistState {
  return symbol === ' ' ? 'open' : 'completed';
}

export class TodoistStateMapping implements ProviderStateMapping {
  private readonly save: () => Promise<void>;
  /**
   * Only what the user changed, per symbol. A choice for a status no longer defined is kept, so it
   * applies again should the status come back.
   */
  private chosen = new Map<string, TodoistState>();

  constructor(save: () => Promise<void>) {
    this.save = save;
  }

  display(containerEl: HTMLElement, statuses: readonly UserStatus[]): void {
    for (const { symbol, name } of statuses) {
      new Setting(containerEl).setName(`[${symbol}] ${name}`).addDropdown((dropdown) =>
        dropdown
          .addOptions(STATE_NAMES)
          .setValue(this.stateOf(symbol))
          .onChange((value) => {
            void this.choose(symbol, value);
          }),
      );
    }
  }

  isCompleted(symbol: string): boolean {
    return this.stateOf(symbol) === 'completed';
  }

  restore(stored: unknown): void {
    const entries = isRecord(stored) ? Object.entries(stored) : [];

    this.chosen = new Map(entries.filter(isStoredChoice));
  }

  toStored(): unknown {
    return Object.fromEntries(this.chosen);
  }

  private stateOf(symbol: string): TodoistState {
    return this.chosen.get(symbol) ?? defaultStateFor(symbol);
  }

  private async choose(symbol: string, state: string): Promise<void> {
    if (!isTodoistState(state)) {
      return;
    }

    if (state === defaultStateFor(symbol)) {
      this.chosen.delete(symbol);
    } else {
      this.chosen.set(symbol, state);
    }

    logger.debug('Status mapping changed', { symbol, state });
    await this.save();
  }
}

function isStoredChoice(entry: [string, unknown]): entry is [string, TodoistState] {
  const [symbol, state] = entry;

  return symbol.length === 1 && isTodoistState(state);
}

function isTodoistState(value: unknown): value is TodoistState {
  return value === 'open' || value === 'completed';
}
