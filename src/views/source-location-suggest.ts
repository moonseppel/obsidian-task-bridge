import { AbstractInputSuggest, App, TFile, TFolder } from 'obsidian';
import { matchingSuggestions } from './suggestions';

export type SourceLocation = TFile | TFolder;
export type SourceLocationSelectHandler = (relativePath: string) => void;

/** Suggests both notes and folders: picking a note scopes to it, picking a folder to everything under it. */
export class SourceLocationSuggest extends AbstractInputSuggest<SourceLocation> {
  private readonly onSelectPath: SourceLocationSelectHandler;

  constructor(app: App, inputEl: HTMLInputElement, onSelectPath: SourceLocationSelectHandler) {
    super(app, inputEl);
    this.onSelectPath = onSelectPath;
  }

  protected getSuggestions(query: string): SourceLocation[] {
    const locations: SourceLocation[] = [...this.app.vault.getMarkdownFiles(), ...this.app.vault.getAllFolders(false)];

    return matchingSuggestions(locations, (location) => location.path, query);
  }

  renderSuggestion(location: SourceLocation, el: HTMLElement): void {
    el.setText(location instanceof TFolder ? `${location.path}/` : location.path);
  }

  selectSuggestion(location: SourceLocation): void {
    this.setValue(location.path);
    this.onSelectPath(location.path);
    this.close();
  }
}
