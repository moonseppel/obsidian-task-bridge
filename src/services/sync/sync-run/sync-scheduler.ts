import { Logger } from '../../../utils/logger';
import { isAutomaticSyncEnabled } from '../../../utils/sync-interval';

const logger = new Logger('TaskBridge:Sync');
const MILLISECONDS_PER_MINUTE = 60_000;
/** Long enough that a burst of keystrokes settles into one sync. */
const DEBOUNCE_MS = 10_000;

export type RunSync = () => void;
export type RegisterInterval = (id: number) => void;

const NOTHING_TO_CANCEL = (): void => undefined;

/**
 * Owns the two timers a sync can be started by. Each one is remembered as the call that would
 * cancel it, so there is no handle to keep, compare or null out. It is also the one place that
 * knows whether automatic syncing is on at all, so an interval of 0 silences both timers rather
 * than only the poll.
 */
export class SyncScheduler {
  private readonly run: RunSync;
  private readonly registerInterval: RegisterInterval;
  private cancelPoll: () => void = NOTHING_TO_CANCEL;
  private cancelPending: () => void = NOTHING_TO_CANCEL;
  private isAutomatic = false;

  constructor(run: RunSync, registerInterval: RegisterInterval) {
    this.run = run;
    this.registerInterval = registerInterval;
  }

  /** Picks up a changed interval without waiting out the old one; 0 stops syncing automatically. */
  restartPolling(everyMinutes: number): void {
    this.cancelPoll();
    this.cancelPoll = NOTHING_TO_CANCEL;
    this.isAutomatic = isAutomaticSyncEnabled(everyMinutes);

    if (!this.isAutomatic) {
      // An edit made just before the interval was turned off must not still sync afterwards.
      this.cancelPendingSync();
      return;
    }

    const id = window.setInterval(() => {
      logger.debug('Poll interval elapsed; syncing');
      this.run();
    }, everyMinutes * MILLISECONDS_PER_MINUTE);
    this.cancelPoll = () => window.clearInterval(id);
    this.registerInterval(id);
  }

  syncWhenTypingStops(): void {
    if (!this.isAutomatic) {
      logger.debug('Sync after editing skipped', 'automatic syncing is off');
      return;
    }

    this.cancelPending();

    const id = window.setTimeout(() => {
      this.cancelPending = NOTHING_TO_CANCEL;
      logger.debug('Edits have settled; syncing');
      this.run();
    }, DEBOUNCE_MS);

    this.cancelPending = () => window.clearTimeout(id);
  }

  /** Whether either timer would start a sync, which an interval of 0 turns off entirely. */
  get syncsAutomatically(): boolean {
    return this.isAutomatic;
  }

  cancelPendingSync(): void {
    this.cancelPending();
    this.cancelPending = NOTHING_TO_CANCEL;
  }
}
