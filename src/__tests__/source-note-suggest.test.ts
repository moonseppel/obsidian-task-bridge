import { App, TFile } from 'obsidian';
import { SourceNoteSuggest } from '../views/source-note-suggest';

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  return file;
}

function appWithNotes(paths: string[]): App {
  return { vault: { getMarkdownFiles: (): TFile[] => paths.map(tfile) } } as unknown as App;
}

/** Reach the protected `getSuggestions` for assertions. */
function suggestionsOf(app: App, query: string): string[] {
  const suggest = new SourceNoteSuggest(app, {} as HTMLInputElement, () => {});
  const withGetSuggestions = suggest as unknown as { getSuggestions(q: string): TFile[] };
  return withGetSuggestions.getSuggestions(query).map((file) => file.path);
}

describe('SourceNoteSuggest', () => {
  it('suggests only markdown notes matching the query', () => {
    const app = appWithNotes(['Tasks.md', 'Inbox.md', 'projects/Task-list.md']);
    expect(suggestionsOf(app, 'task')).toEqual(['projects/Task-list.md', 'Tasks.md']);
  });

  it('suggests every markdown note for an empty query', () => {
    const app = appWithNotes(['b.md', 'a.md']);
    expect(suggestionsOf(app, '')).toEqual(['a.md', 'b.md']);
  });

  it('passes the chosen note path to the select handler', () => {
    const chosen: string[] = [];
    const suggest = new SourceNoteSuggest(appWithNotes([]), {} as HTMLInputElement, (path) => {
      chosen.push(path);
    });
    suggest.selectSuggestion(tfile('projects/Tasks.md'));
    expect(chosen).toEqual(['projects/Tasks.md']);
  });
});
