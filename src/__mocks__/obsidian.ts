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

export interface RequestUrlParam {
  url: string;
  method?: string;
  contentType?: string;
  body?: string | ArrayBuffer;
  headers?: Record<string, string>;
  throw?: boolean;
}

export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
  json: unknown;
  text: string;
}

export function requestUrl(_request: RequestUrlParam | string): Promise<RequestUrlResponse> {
  throw new Error('requestUrl reaches the network and must be mocked in tests.');
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

export class SecretComponent {
  app: App;

  constructor(app: App, _containerEl: HTMLElement) {
    this.app = app;
  }

  setValue(_value: string): this {
    return this;
  }

  onChange(_handler: (value: string) => unknown): this {
    return this;
  }

  setDisabled(_disabled: boolean): this {
    return this;
  }
}

export class ButtonComponent {
  buttonEl: HTMLElement = createMockElement();

  setButtonText(_text: string): this {
    return this;
  }

  setDisabled(_disabled: boolean): this {
    return this;
  }

  onClick(_handler: (event: MouseEvent) => unknown): this {
    return this;
  }
}

export class Setting {
  settingEl: HTMLElement = createMockElement();
  /** Not part of Obsidian's Setting — lets tests read a row's current text back. */
  description = '';

  constructor(_containerEl: HTMLElement) {}

  setName(_name: string): this {
    return this;
  }

  setDesc(description: string | DocumentFragment): this {
    this.description = typeof description === 'string' ? description : '';
    return this;
  }

  setHeading(): this {
    return this;
  }

  addSearch(callback: (component: SearchComponent) => void): this {
    callback(new SearchComponent());
    return this;
  }

  addText(callback: (component: SearchComponent) => void): this {
    return this.addSearch(callback);
  }

  addButton(callback: (component: ButtonComponent) => void): this {
    callback(new ButtonComponent());
    return this;
  }

  addComponent<T>(callback: (el: HTMLElement) => T): this {
    callback(createMockElement());
    return this;
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
