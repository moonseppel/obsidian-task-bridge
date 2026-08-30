/**
 * Mock implementation of Obsidian API for testing
 */

export class Plugin {
  app: any;
  manifest: any;

  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  onload(): void {
    // Override in subclass
  }

  onunload(): void {
    // Override in subclass
  }

  registerEvent(_eventRef: any): void {
    // Mock implementation
  }

  registerInterval(_id: any): void {
    // Mock implementation
  }
}

export class Notice {
  message: string;

  constructor(message: string | DocumentFragment, _duration?: number) {
    if (typeof message === 'string') {
      this.message = message;
    } else {
      this.message = '';
    }
  }
}

export class App {
  vault: any;
  workspace: any;
}
