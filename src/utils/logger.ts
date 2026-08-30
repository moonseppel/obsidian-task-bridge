/**
 * Simple logging utility for the plugin.
 * Provides consistent logging with a namespace prefix.
 */
export class Logger {
  private namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  /**
   * Log an info-level message
   */
  info(message: string, data?: unknown): void {
    console.info(`[${this.namespace}] ${message}`, data);
  }

  /**
   * Log a warning-level message
   */
  warn(message: string, data?: unknown): void {
    console.warn(`[${this.namespace}] ${message}`, data);
  }

  /**
   * Log an error-level message
   */
  error(message: string, error?: unknown): void {
    console.error(`[${this.namespace}] ${message}`, error);
  }

  /**
   * Log a debug-level message
   */
  debug(message: string, data?: unknown): void {
    if (process.env.DEBUG) {
      console.debug(`[${this.namespace}] ${message}`, data);
    }
  }
}
