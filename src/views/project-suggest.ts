import { AbstractInputSuggest, App } from 'obsidian';
import { ProviderProject } from '../services/task-provider';
import { matchingSuggestions } from './suggestions';

export interface ProjectPicker {
  /** The remembered project list, so the picker still offers choices while offline. */
  readonly readProjects: () => readonly ProviderProject[];
  readonly onSelect: (project: ProviderProject) => void;
}

export class ProjectSuggest extends AbstractInputSuggest<ProviderProject> {
  private readonly picker: ProjectPicker;

  constructor(app: App, inputEl: HTMLInputElement, picker: ProjectPicker) {
    super(app, inputEl);
    this.picker = picker;
  }

  protected getSuggestions(query: string): ProviderProject[] {
    return matchingSuggestions(this.picker.readProjects(), (project) => project.name, query);
  }

  renderSuggestion(project: ProviderProject, el: HTMLElement): void {
    el.setText(project.name);
  }

  selectSuggestion(project: ProviderProject): void {
    this.setValue(project.name);
    this.picker.onSelect(project);
    this.close();
  }
}
