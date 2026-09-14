import { sanitizeForDisplay } from '../utils/external-text';
import { Logger } from '../utils/logger';
import { ConnectionStatus } from './provider-connection';
import { SyncOutcome, changedAnything } from './sync/sync-outcome';
import { TaskProviderError, TaskProviderFailure, isTransientFailure } from './task-provider-error';

const SYNC_FAILED_MESSAGE = 'Syncing tasks failed unexpectedly. Check the console for details.';

export type NotifyUser = (message: string) => void;

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
  private reportedFailure: string | undefined = undefined;
  private reportedCoverage: Coverage | undefined = undefined;

  constructor(logger: Logger, notify: NotifyUser) {
    this.logger = logger;
    this.notify = notify;
  }

  reportConnectionStatus(status: ConnectionStatus): void {
    if (status.state !== 'failed') {
      this.logger.info('Task provider connection status', status.state);
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
      this.logger.debug('Task sync finished with nothing to do');
    }
  }

  reportSyncFailure(error: unknown): void {
    const { failure, message } = describeFailure(error);
    const reason = reasonOf(error);

    this.reportedCoverage = undefined;

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
}

function sameCoverage(current: Coverage, reported: Coverage | undefined): boolean {
  return (
    reported !== undefined &&
    current.filesScanned === reported.filesScanned &&
    current.linkedTasks === reported.linkedTasks
  );
}

/**
 * A provider failure is one reason whatever detail comes with it, so a flaky connection is not reported
 * anew on every poll; any other error is its own reason, so a second, different bug still shows.
 */
function reasonOf(error: unknown): string {
  if (error instanceof TaskProviderError) {
    return error.failure;
  }

  return error instanceof Error ? error.name + ': ' + error.message : String(error);
}

function describeFailure(error: unknown): SyncFailure {
  if (error instanceof TaskProviderError) {
    return { failure: error.failure, message: sanitizeForDisplay(error.message) };
  }

  return { failure: 'unexpected', message: SYNC_FAILED_MESSAGE };
}
