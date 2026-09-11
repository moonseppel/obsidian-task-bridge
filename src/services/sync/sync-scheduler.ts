const MILLISECONDS_PER_MINUTE = 60_000;
/** Long enough that a burst of keystrokes settles into one sync. */
const DEBOUNCE_MS = 2_000;

export type RunSync = () => void;
export type RegisterInterval = (id: number) => void;

const NOTHING_TO_CANCEL = (): void => undefined;

/**
 * Owns the two timers a sync can be started by. Each one is remembered as the call that would
 * cancel it, so there is no handle to keep, compare or null out.
 */
export class SyncScheduler {
  private readonly run: RunSync;
  private readonly registerInterval: RegisterInterval;
  private cancelPoll: () => void = NOTHING_TO_CANCEL;
  private cancelPending: () => void = NOTHING_TO_CANCEL;

  constructor(run: RunSync, registerInterval: RegisterInterval) {
    this.run = run;
    this.registerInterval = registerInterval;
  }

  /** Picks up a changed interval without waiting out the old one. */
  restartPolling(everyMinutes: number): void {
    this.cancelPoll();

    const id = window.setInterval(() => this.run(), everyMinutes * MILLISECONDS_PER_MINUTE);
    this.cancelPoll = () => window.clearInterval(id);
    this.registerInterval(id);
  }

  syncWhenTypingStops(): void {
    this.cancelPending();

    const id = window.setTimeout(() => {
      this.cancelPending = NOTHING_TO_CANCEL;
      this.run();
    }, DEBOUNCE_MS);

    this.cancelPending = () => window.clearTimeout(id);
  }

  cancelPendingSync(): void {
    this.cancelPending();
    this.cancelPending = NOTHING_TO_CANCEL;
  }
}
