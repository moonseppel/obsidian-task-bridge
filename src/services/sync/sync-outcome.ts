import { ProjectResolution } from './project-resolver';

export interface SyncOutcome {
  created: number;
  pushed: number;
  pulled: number;
  conflicted: number;
  /** A note line removed because its linked task was deleted in the provider. */
  removedLine: number;
  /** A provider task removed because its linked line was deleted from the note. */
  removedTask: number;
  /** A task recreated because it was deleted remotely while its line carried a newer local edit. */
  recreatedTask: number;
  /** A line re-appended because its task carried a newer remote edit after the line was deleted. */
  resurrectedLine: number;
  projectResolution: ProjectResolution;
}

export function emptyOutcome(projectResolution: ProjectResolution): SyncOutcome {
  return {
    created: 0,
    pushed: 0,
    pulled: 0,
    conflicted: 0,
    removedLine: 0,
    removedTask: 0,
    recreatedTask: 0,
    resurrectedLine: 0,
    projectResolution,
  };
}

/** Sums each file's pass into one outcome for the run, since a project is resolved only once. */
export function mergeOutcomes(outcomes: readonly SyncOutcome[], projectResolution: ProjectResolution): SyncOutcome {
  return outcomes.reduce(
    (total, outcome) => ({
      created: total.created + outcome.created,
      pushed: total.pushed + outcome.pushed,
      pulled: total.pulled + outcome.pulled,
      conflicted: total.conflicted + outcome.conflicted,
      removedLine: total.removedLine + outcome.removedLine,
      removedTask: total.removedTask + outcome.removedTask,
      recreatedTask: total.recreatedTask + outcome.recreatedTask,
      resurrectedLine: total.resurrectedLine + outcome.resurrectedLine,
      projectResolution,
    }),
    emptyOutcome(projectResolution),
  );
}
