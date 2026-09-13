import { AbstractInputSuggest, App, TFile, TFolder } from 'obsidian';
import { filterByQuery } from '../utils/query-filter';

const MAX_SUGGESTIONS = 50;

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
    const locations: SourceLocation[] = [
      ...this.app.vault.getMarkdownFiles(),
      ...this.app.vault.getAllFolders(false),
    ];
    const byPath = new Map<string, SourceLocation>(
      locations.map((location): [string, SourceLocation] => [location.path, location]),
    );
    const selectedPaths = filterByQuery([...byPath.keys()], query, MAX_SUGGESTIONS);

    return selectedPaths
      .map((path) => byPath.get(path))
      .filter((location): location is SourceLocation => location !== undefined);
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
