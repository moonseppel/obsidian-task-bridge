import { sanitizeForDisplay } from '../utils/external-text';
import { Logger } from '../utils/logger';
import { ConnectionStatus } from './provider-connection';
import { SyncOutcome } from './sync/title-sync';
import { TaskProviderError, TaskProviderFailure, isTransientFailure } from './task-provider-error';

const SYNC_FAILED_MESSAGE = 'Syncing tasks failed unexpectedly. Check the console for details.';

export type NotifyUser = (message: string) => void;

interface SyncFailure {
  failure: TaskProviderFailure;
  message: string;
}

/**
 * Turns what the sync did into logs and notices. It remembers the failure it last spoke about, so
 * a condition that persists across every poll is reported when it changes rather than every time.
 */
export class StatusReporter {
  private readonly logger: Logger;
  private readonly notify: NotifyUser;
  private spokenAbout: TaskProviderFailure | undefined = undefined;

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

    this.logger.error('Task provider connection failed', status.message);
    this.notify(status.message);
  }

  reportSyncOutcome(outcome: SyncOutcome): void {
    this.spokenAbout = undefined;

    if (outcome.created + outcome.pushed + outcome.pulled === 0) {
      this.logger.debug('Task sync finished with nothing to do');
      return;
    }

    this.logger.info('Task sync finished', outcome);
  }

  reportSyncFailure(error: unknown): void {
    const { failure, message } = describeFailure(error);

    if (failure === this.spokenAbout) {
      return;
    }

    this.spokenAbout = failure;

    if (isTransientFailure(failure)) {
      this.logger.warn('Task sync failed; it retries on its own', message);
      return;
    }

    this.logger.error('Task sync failed', error);
    this.notify(message);
  }
}

function describeFailure(error: unknown): SyncFailure {
  if (error instanceof TaskProviderError) {
    return { failure: error.failure, message: sanitizeForDisplay(error.message) };
  }

  return { failure: 'unexpected', message: SYNC_FAILED_MESSAGE };
}
