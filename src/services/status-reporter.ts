import { sanitizeForDisplay } from '../utils/external-text';
import { Logger } from '../utils/logger';
import { ConnectionStatus } from './provider-connection';
import { SyncOutcome, changedAnything } from './sync/sync-run/sync-outcome';
import {
  TaskProviderError,
  TaskProviderFailure,
  failureReasonOf,
  isTransientFailure,
  needsDailyReminder,
} from './task-provider-error';

const SYNC_FAILED_MESSAGE = 'Syncing tasks failed unexpectedly. Check the console for details.';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type NotifyUser = (message: string) => void;

/** Where the "last reminded at" timestamp for a device-only failure is kept, so it survives a restart. */
export interface CredentialReminderStore {
  get(): number;
  set(at: number): void;
}

interface SyncFailure {
  failure: TaskProviderFailure;
  message: string;
}

/** What a quiet sync covered: the notes it scanned and the tasks linked once it was done. */
interface Coverage {
  readonly filesScanned: number;
  readonly linkedTasks: number;
}

/**
 * Turns what the sync did into logs and notices. It remembers what it last spoke about — a failure's
 * reason, or what a quiet sync covered — so a condition that persists across every poll is reported when it
 * changes rather than every time, while the log still shows that syncing is working at all.
 */
export class StatusReporter {
  private readonly logger: Logger;
  private readonly notify: NotifyUser;
  private readonly reminders: CredentialReminderStore;
  private reportedFailure: string | undefined = undefined;
  private reportedCoverage: Coverage | undefined = undefined;

  constructor(logger: Logger, notify: NotifyUser, reminders: CredentialReminderStore) {
    this.logger = logger;
    this.notify = notify;
    this.reminders = reminders;
  }

  reportConnectionStatus(status: ConnectionStatus, now: number = Date.now()): void {
    if (status.state !== 'failed') {
      this.logger.info('Task provider connection status', status.state);
      return;
    }

    if (needsDailyReminder(status.failure)) {
      this.reportDailyReminder(status.message, status.error, now);
      return;
    }

    if (isTransientFailure(status.failure)) {
      this.logger.warn('Task provider connection failed; it retries on its own', status.message);
      return;
    }

    this.logger.error('Task provider connection failed', status.error);
    this.notify(status.message);
  }

  reportSyncOutcome(outcome: SyncOutcome): void {
    const coverage = { filesScanned: outcome.filesScanned, linkedTasks: outcome.linkedTasks };
    const coverageChanged = !sameCoverage(coverage, this.reportedCoverage);

    this.reportedFailure = undefined;
    this.reportedCoverage = coverage;

    if (changedAnything(outcome)) {
      this.logger.info('Task sync finished', outcome);
    } else if (coverageChanged) {
      this.logger.info('Task sync is up to date', coverage);
    } else {
      this.logger.debug('Task sync finished. Nothing changed.');
    }
  }

  reportSyncFailure(error: unknown, now: number = Date.now()): void {
    const { failure, message } = describeFailure(error);
    const reason = failureReasonOf(error);

    this.reportedCoverage = undefined;

    if (needsDailyReminder(failure)) {
      this.reportDailyReminder(message, error, now);
      return;
    }

    if (reason === this.reportedFailure) {
      this.logger.debug('Task sync failed again for the same reason', message);
      return;
    }

    this.reportedFailure = reason;

    if (isTransientFailure(failure)) {
      this.logger.warn('Task sync failed; it retries on its own', message);
      return;
    }

    this.logger.error('Task sync failed', error);
    this.notify(message);
  }

  /** Reminded once, then at most once a day, so a device-only failure nags without piling up notices. */
  private reportDailyReminder(message: string, error: unknown, now: number): void {
    const last = this.reminders.get();

    if (last !== 0 && now - last < ONE_DAY_MS) {
      this.logger.debug('Task provider still needs attention on this device; reminder throttled', message);
      return;
    }

    this.reminders.set(now);
    this.logger.error('Task provider needs attention on this device', error);
    this.notify(message);
  }
}

function sameCoverage(current: Coverage, reported: Coverage | undefined): boolean {
  return (
    reported !== undefined &&
    current.filesScanned === reported.filesScanned &&
    current.linkedTasks === reported.linkedTasks
  );
}

function describeFailure(error: unknown): SyncFailure {
  if (error instanceof TaskProviderError) {
    return { failure: error.failure, message: sanitizeForDisplay(error.message) };
  }

  return { failure: 'unexpected', message: SYNC_FAILED_MESSAGE };
}
