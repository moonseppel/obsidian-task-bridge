import { UserStatus } from './user-status';

/**
 * Which states a task can be in differs between providers, so how the statuses a user defined in
 * Obsidian map onto them is the provider's own business: it draws the rows for it and owns the
 * values behind them, the way it does its credentials.
 */
export interface ProviderStateMapping {
  display(containerEl: HTMLElement, statuses: readonly UserStatus[]): void;
  /** Whether a task in the status with this checkbox symbol is completed in the provider. */
  isCompleted(symbol: string): boolean;
  restore(stored: unknown): void;
  toStored(): unknown;
}
