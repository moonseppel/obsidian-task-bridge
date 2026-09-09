import { ConnectionStatus } from '../services/provider-connection';

export function describeConnectionStatus(status: ConnectionStatus, providerName: string): string {
  switch (status.state) {
    case 'idle':
      return `Not connected to ${providerName} yet.`;
    case 'connecting':
      return `Connecting to ${providerName}…`;
    case 'not-configured':
      return `No API token configured. Add one above to connect to ${providerName}.`;
    case 'connected':
      return `Connected to ${providerName} as ${status.account.displayName}.`;
    case 'failed':
      return status.message;
  }
}
