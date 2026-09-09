export class Logger {
  private namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  info(message: string, data?: unknown): void {
    if (data !== undefined) {
      console.info(`[${this.namespace}] ${message}`, data);
    } else {
      console.info(`[${this.namespace}] ${message}`);
    }
  }

  warn(message: string, data?: unknown): void {
    if (data !== undefined) {
      console.warn(`[${this.namespace}] ${message}`, data);
    } else {
      console.warn(`[${this.namespace}] ${message}`);
    }
  }

  error(message: string, error?: unknown): void {
    if (error !== undefined) {
      console.error(`[${this.namespace}] ${message}`, error);
    } else {
      console.error(`[${this.namespace}] ${message}`);
    }
  }

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
