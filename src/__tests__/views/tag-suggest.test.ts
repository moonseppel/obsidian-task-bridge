import { App, CachedMetadata, TFile } from 'obsidian';
import { TagSuggest } from '../../views/tag-suggest';

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  return file;
}

function appWithTags(filesToTags: Record<string, string[]>): App {
  const files = Object.keys(filesToTags).map(tfile);
  const cacheByPath = new Map<string, CachedMetadata>(
    Object.entries(filesToTags).map(([path, tags]) => [
      path,
      { tags: tags.map((tag) => ({ tag, position: {} as never })) },
    ]),
  );

  return {
    vault: { getMarkdownFiles: (): TFile[] => files },
    metadataCache: { getFileCache: (file: TFile): CachedMetadata | null => cacheByPath.get(file.path) ?? null },
  } as unknown as App;
}

function suggestionsOf(app: App, query: string): string[] {
  const suggest = new TagSuggest(app, {} as HTMLInputElement, () => {});
  const withGetSuggestions = suggest as unknown as { getSuggestions(q: string): string[] };
  return withGetSuggestions.getSuggestions(query);
}

describe('TagSuggest', () => {
  it('suggests tags found across the vault, without the leading #', () => {
    const app = appWithTags({ 'Tasks.md': ['#work'], 'Notes.md': ['#personal'] });
    expect(suggestionsOf(app, '')).toEqual(['personal', 'work']);
  });

  it('deduplicates a tag used in more than one note', () => {
    const app = appWithTags({ 'Tasks.md': ['#work'], 'Notes.md': ['#work'] });
    expect(suggestionsOf(app, '')).toEqual(['work']);
  });

  it('filters suggestions by the query', () => {
    const app = appWithTags({ 'Tasks.md': ['#work', '#personal'] });
    expect(suggestionsOf(app, 'wor')).toEqual(['work']);
  });

  it('handles a note with no cached tags', () => {
    const app = appWithTags({ 'Tasks.md': [] });
    expect(suggestionsOf(app, '')).toEqual([]);
  });

  it('renders a suggestion with a leading #', () => {
    const suggest = new TagSuggest({} as App, {} as HTMLInputElement, () => {});
    const el = { setText: jest.fn() } as unknown as HTMLElement;

    suggest.renderSuggestion('work', el);

    expect(el.setText).toHaveBeenCalledWith('#work');
  });

  it('passes the chosen tag to the select handler', () => {
    const chosen: string[] = [];
    const suggest = new TagSuggest({} as App, {} as HTMLInputElement, (tag) => chosen.push(tag));
    suggest.selectSuggestion('work');
    expect(chosen).toEqual(['work']);
  });
});
