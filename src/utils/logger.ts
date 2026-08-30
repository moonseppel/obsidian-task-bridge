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
    if (data !== undefined) {
      console.info(`[${this.namespace}] ${message}`, data);
    } else {
      console.info(`[${this.namespace}] ${message}`);
    }
  }

  /**
   * Log a warning-level message
   */
  warn(message: string, data?: unknown): void {
    if (data !== undefined) {
      console.warn(`[${this.namespace}] ${message}`, data);
    } else {
      console.warn(`[${this.namespace}] ${message}`);
    }
  }

  /**
   * Log an error-level message
   */
  error(message: string, error?: unknown): void {
    if (error !== undefined) {
      console.error(`[${this.namespace}] ${message}`, error);
    } else {
      console.error(`[${this.namespace}] ${message}`);
    }
  }

  /**
   * Log a debug-level message
   */
  debug(message: string, data?: unknown): void {
    if (process.env.DEBUG) {
      if (data !== undefined) {
        console.debug(`[${this.namespace}] ${message}`, data);
      } else {
        console.debug(`[${this.namespace}] ${message}`);
      }
    }
  }
}
