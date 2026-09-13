import { AbstractInputSuggest, App } from 'obsidian';
import { filterByQuery } from '../utils/query-filter';

const MAX_SUGGESTIONS = 50;

export type TagSelectHandler = (tag: string) => void;

/** Suggests tags already used somewhere in the vault, but a tag typed fresh is accepted too. */
export class TagSuggest extends AbstractInputSuggest<string> {
  private readonly onSelectTag: TagSelectHandler;

  constructor(app: App, inputEl: HTMLInputElement, onSelectTag: TagSelectHandler) {
    super(app, inputEl);
    this.onSelectTag = onSelectTag;
  }

  protected getSuggestions(query: string): string[] {
    return filterByQuery([...this.vaultTags()], query, MAX_SUGGESTIONS);
  }

  renderSuggestion(tag: string, el: HTMLElement): void {
    el.setText(`#${tag}`);
  }

  selectSuggestion(tag: string): void {
    this.setValue(tag);
    this.onSelectTag(tag);
    this.close();
  }

  private vaultTags(): Set<string> {
    const tags = new Set<string>();

    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);

      for (const tagCache of cache?.tags ?? []) {
        tags.add(tagCache.tag.replace(/^#/, ''));
      }
    }

    return tags;
  }
}
