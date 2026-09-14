import { ProviderAccount, TaskProvider } from './task-provider';
import { TaskProviderError, TaskProviderFailure } from './task-provider-error';

/** A failed check keeps the error that failed it, so the log shows its cause and stack. */
export type ConnectionStatus =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'not-configured' }
  | { state: 'connected'; account: ProviderAccount }
  | { state: 'failed'; failure: TaskProviderFailure; message: string; error: unknown };

export class ProviderConnection {
  private readonly provider: TaskProvider;
  private currentStatus: ConnectionStatus = { state: 'idle' };

  constructor(provider: TaskProvider) {
    this.provider = provider;
  }

  get status(): ConnectionStatus {
    return this.currentStatus;
  }

  get defaultProjectName(): string {
    return this.provider.description.defaultProjectName;
  }

  get providerName(): string {
    return this.provider.description.displayName;
  }

  async connect(): Promise<ConnectionStatus> {
    if (this.currentStatus.state === 'connecting') {
      return this.currentStatus;
    }

    this.currentStatus = { state: 'connecting' };
    this.currentStatus = await this.attemptConnection();

    return this.currentStatus;
  }

  private async attemptConnection(): Promise<ConnectionStatus> {
    try {
      return { state: 'connected', account: await this.provider.connect() };
    } catch (error) {
      return toFailureStatus(error);
    }
  }
}

function toFailureStatus(error: unknown): ConnectionStatus {
  if (!(error instanceof TaskProviderError)) {
    return { state: 'failed', failure: 'unexpected', message: 'The connection check failed unexpectedly.', error };
  }

  return error.failure === 'not-configured'
    ? { state: 'not-configured' }
    : { state: 'failed', failure: error.failure, message: error.message, error };
}
