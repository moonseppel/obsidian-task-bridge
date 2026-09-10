import { AbstractInputSuggest, App } from 'obsidian';
import { ProviderProject } from '../services/task-provider';
import { filterByQuery } from '../utils/query-filter';

const MAX_SUGGESTIONS = 50;

export type ProjectSelectHandler = (project: ProviderProject) => void;
/** Reads the remembered project list, so the picker still offers choices while offline. */
export type ProjectListReader = () => readonly ProviderProject[];

export class ProjectSuggest extends AbstractInputSuggest<ProviderProject> {
  private readonly readProjects: ProjectListReader;
  private readonly onSelectProject: ProjectSelectHandler;

  constructor(
    app: App,
    inputEl: HTMLInputElement,
    readProjects: ProjectListReader,
    onSelectProject: ProjectSelectHandler,
  ) {
    super(app, inputEl);
    this.readProjects = readProjects;
    this.onSelectProject = onSelectProject;
  }

  protected getSuggestions(query: string): ProviderProject[] {
    const projectsByName = new Map(
      this.readProjects().map((project): [string, ProviderProject] => [project.name, project]),
    );
    const names = filterByQuery([...projectsByName.keys()], query, MAX_SUGGESTIONS);

    return names
      .map((name) => projectsByName.get(name))
      .filter((project): project is ProviderProject => project !== undefined);
  }

  renderSuggestion(project: ProviderProject, el: HTMLElement): void {
    el.setText(project.name);
  }

  selectSuggestion(project: ProviderProject): void {
    this.setValue(project.name);
    this.onSelectProject(project);
    this.close();
  }
}
