import { App, TFile, TFolder } from 'obsidian';
import { SourceLocationSuggest } from '../views/source-location-suggest';

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  return file;
}

function tfolder(path: string): TFolder {
  const folder = new TFolder();
  folder.path = path;
  return folder;
}

function appWith(notePaths: string[], folderPaths: string[]): App {
  return {
    vault: {
      getMarkdownFiles: (): TFile[] => notePaths.map(tfile),
      getAllFolders: (): TFolder[] => folderPaths.map(tfolder),
    },
  } as unknown as App;
}

function suggestionsOf(app: App, query: string): string[] {
  const suggest = new SourceLocationSuggest(app, {} as HTMLInputElement, () => {});
  const withGetSuggestions = suggest as unknown as { getSuggestions(q: string): Array<TFile | TFolder> };
  return withGetSuggestions.getSuggestions(query).map((location) => location.path);
}

describe('SourceLocationSuggest', () => {
  it('suggests both notes and folders matching the query', () => {
    const app = appWith(['Tasks.md', 'Inbox.md'], ['projects/Tasks']);
    expect(suggestionsOf(app, 'task')).toEqual(['projects/Tasks', 'Tasks.md']);
  });

  it('suggests every note and folder for an empty query', () => {
    const app = appWith(['b.md'], ['a-folder']);
    expect(suggestionsOf(app, '')).toEqual(['a-folder', 'b.md']);
  });

  it('renders a folder with a trailing slash and a note without one', () => {
    const suggest = new SourceLocationSuggest({} as App, {} as HTMLInputElement, () => {});
    const el = { setText: jest.fn() } as unknown as HTMLElement;

    suggest.renderSuggestion(tfolder('projects'), el);
    suggest.renderSuggestion(tfile('Tasks.md'), el);

    expect((el.setText as jest.Mock).mock.calls).toEqual([['projects/'], ['Tasks.md']]);
  });

  it('passes the chosen note path to the select handler', () => {
    const chosen: string[] = [];
    const suggest = new SourceLocationSuggest({} as App, {} as HTMLInputElement, (path) => {
      chosen.push(path);
    });
    suggest.selectSuggestion(tfile('projects/Tasks.md'));
    expect(chosen).toEqual(['projects/Tasks.md']);
  });

  it('passes the chosen folder path to the select handler', () => {
    const chosen: string[] = [];
    const suggest = new SourceLocationSuggest({} as App, {} as HTMLInputElement, (path) => {
      chosen.push(path);
    });
    suggest.selectSuggestion(tfolder('projects'));
    expect(chosen).toEqual(['projects']);
  });
});
