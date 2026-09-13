import { sanitizeForDisplay } from './external-text';
import { isRecord } from './type-guards';

/**
 * Off unless the user turns debug mode on. Reading `process.env` instead would throw on mobile,
 * where Obsidian gives plugins no Node globals.
 */
let debugLogging = false;

export function setDebugLogging(enabled: boolean): void {
  debugLogging = enabled;
}

export function isDebugLogging(): boolean {
  return debugLogging;
}

type ConsoleWriter = (message: string, ...data: unknown[]) => void;

export class Logger {
  private readonly namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  info(message: string, data?: unknown): void {
    this.write(console.info, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.write(console.warn, message, data);
  }

  error(message: string, error?: unknown): void {
    this.write(console.error, message, error);
  }

  debug(message: string, data?: unknown): void {
    if (debugLogging) {
      this.write(console.debug, message, data);
    }
  }

  /** Omitting an absent second argument keeps a bare message from logging a trailing `undefined`. */
  private write(to: ConsoleWriter, message: string, data: unknown): void {
    const line = `[${this.namespace}] ${message}`;

    if (data === undefined) {
      to(line);
      return;
    }

    to(line, displayable(data));
  }
}

/**
 * Anything logged may have come from outside the plugin, so a string — on its own or as a field of a
 * plain object — is made safe to display first, while an error is kept whole so its stack survives.
 */
function displayable(data: unknown): unknown {
  if (typeof data === 'string') {
    return sanitizeForDisplay(data);
  }

  if (!isRecord(data) || Object.getPrototypeOf(data) !== Object.prototype) {
    return data;
  }

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? sanitizeForDisplay(value) : value]),
  );
}
