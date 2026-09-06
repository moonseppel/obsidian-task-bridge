/**
 * Mock implementation of the Obsidian API for testing.
 *
 * Only the surface the plugin actually touches is modelled. Anything exported here
 * mirrors the real `obsidian` module shape closely enough for `ts-jest` to type-check
 * production code against it.
 */

// Mirror of the subset of Obsidian's global `HTMLElement` augmentation the plugin uses.
declare global {
  interface HTMLElement {
    empty(): void;
    setText(value: string | DocumentFragment): void;
    addClass(...classNames: string[]): void;
    removeClass(...classNames: string[]): void;
    toggleClass(classNames: string | string[], force: boolean): void;
    hasClass(className: string): boolean;
  }
}

/** Minimal stand-in for an Obsidian-augmented DOM element. */
export class MockElement {
  private readonly classes = new Set<string>();
  private readonly listeners = new Map<string, Array<() => void>>();
  textContent = '';

  empty(): void {
    this.textContent = '';
  }

  setText(value: string | DocumentFragment): void {
    this.textContent = typeof value === 'string' ? value : '';
  }

  addClass(...classNames: string[]): void {
    for (const className of classNames) {
      this.classes.add(className);
    }
  }

  removeClass(...classNames: string[]): void {
    for (const className of classNames) {
      this.classes.delete(className);
    }
  }

  toggleClass(classNames: string | string[], force: boolean): void {
    const classList = Array.isArray(classNames) ? classNames : [classNames];
    
    for (const className of classList) {
      if (force) {
        this.addClass(className);
      } else {
        this.removeClass(className);
      }
    }
  }

  hasClass(className: string): boolean {
    return this.classes.has(className);
  }

  addEventListener(type: string, callback: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(callback);
    this.listeners.set(type, list);
  }

  removeEventListener(): void {}

  dispatch(type: string): void {
    for (const callback of this.listeners.get(type) ?? []) {
      callback();
    }
  }
}

function createMockElement(): HTMLElement {
  return new MockElement() as unknown as HTMLElement;
}

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

export class Notice {
  message: string;

  constructor(message: string | DocumentFragment, _duration?: number) {
    this.message = typeof message === 'string' ? message : '';
  }
}

export class App {
  vault: unknown;
  workspace: unknown;
}

export class TAbstractFile {
  path = '';
  name = '';
}

export class TFile extends TAbstractFile {
  basename = '';
  extension = '';
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export class Plugin {
  app: App;
  manifest: unknown;

  constructor(app: App, manifest: unknown) {
    this.app = app;
    this.manifest = manifest;
  }

  onload(): void {}

  onunload(): void {}

  async loadData(): Promise<unknown> {
    return undefined;
  }

  async saveData(_data: unknown): Promise<void> {}

  addSettingTab(_tab: PluginSettingTab): void {}

  registerEvent(_eventRef: unknown): void {}

  registerInterval(_id: number): void {}

  register(_callback: () => unknown): void {}
}

export class PluginSettingTab {
  app: App;
  containerEl: HTMLElement;

  constructor(app: App, _plugin: Plugin) {
    this.app = app;
    this.containerEl = createMockElement();
  }

  display(): void {}

  hide(): void {}
}

export class SearchComponent {
  inputEl: HTMLInputElement = createMockElement() as unknown as HTMLInputElement;
  private value = '';

  setPlaceholder(_placeholder: string): this {
    return this;
  }

  setValue(value: string): this {
    this.value = value;
    return this;
  }

  getValue(): string {
    return this.value;
  }

  onChange(_handler: (value: string) => unknown): this {
    return this;
  }
}

export class Setting {
  settingEl: HTMLElement = createMockElement();

  constructor(_containerEl: HTMLElement) {}

  setName(_name: string): this {
    return this;
  }

  setDesc(_description: string | DocumentFragment): this {
    return this;
  }

  addSearch(callback: (component: SearchComponent) => void): this {
    callback(new SearchComponent());
    return this;
  }

  addText(callback: (component: SearchComponent) => void): this {
    return this.addSearch(callback);
  }
}

export abstract class AbstractInputSuggest<T> {
  limit = 100;
  app: App;

  constructor(app: App, _textInputEl: HTMLInputElement | HTMLDivElement) {
    this.app = app;
  }

  setValue(_value: string): void {}

  getValue(): string {
    return '';
  }

  close(): void {}

  onSelect(_callback: (value: T, event: MouseEvent | KeyboardEvent) => unknown): this {
    return this;
  }

  protected abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;

  selectSuggestion(_value: T, _event?: MouseEvent | KeyboardEvent): void {}
}
