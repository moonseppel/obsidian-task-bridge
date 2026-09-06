import { AbstractInputSuggest, App, TFile } from 'obsidian';
import { filterNotePaths } from '../utils/note-filter';

const MAX_SUGGESTIONS = 50;

/** Called with the vault-relative path of the note the user picked. */
export type SourceNoteSelectHandler = (path: string) => void;

/**
 * Fuzzy picker over the vault's markdown notes, bound to a settings text input.
 * On selection it writes the chosen path back into the input and notifies the caller.
 */
export class SourceNoteSuggest extends AbstractInputSuggest<TFile> {
  private readonly onSelectPath: SourceNoteSelectHandler;

  constructor(app: App, inputEl: HTMLInputElement, onSelectPath: SourceNoteSelectHandler) {
    super(app, inputEl);
    this.onSelectPath = onSelectPath;
  }

  protected getSuggestions(query: string): TFile[] {
    const files: TFile[] = this.app.vault.getMarkdownFiles();
    const filesByPath = new Map<string, TFile>(files.map((file): [string, TFile] => [file.path, file]));
    const selectedPaths = filterNotePaths([...filesByPath.keys()], query, MAX_SUGGESTIONS);

    return selectedPaths
      .map((path) => filesByPath.get(path))
      .filter((file): file is TFile => file !== undefined);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    this.onSelectPath(file.path);
    this.close();
  }
}
