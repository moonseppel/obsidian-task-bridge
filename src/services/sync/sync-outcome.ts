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
  /** An orphaned or out-of-scope task given its removal notice. */
  flaggedOrphans: number;
  /** A flagged task that came back before its removal date, its notice reverted. */
  unflaggedOrphans: number;
  /** A flagged task removed once its removal date passed. */
  removedOrphans: number;
  /** A note edit left unwritten because a line it depends on changed while the sync was running. */
  skippedEdits: number;
  /** How many notes the run covered; set once for the whole run rather than summed. */
  filesScanned: number;
  /** How many tasks are linked once the run is done; set once for the whole run rather than summed. */
  linkedTasks: number;
  projectResolution: ProjectResolution;
}

type Counter = Exclude<keyof SyncOutcome, 'filesScanned' | 'linkedTasks' | 'projectResolution'>;

const COUNTERS: readonly Counter[] = [
  'created',
  'pushed',
  'pulled',
  'conflicted',
  'removedLine',
  'removedTask',
  'recreatedTask',
  'resurrectedLine',
  'flaggedOrphans',
  'unflaggedOrphans',
  'removedOrphans',
  'skippedEdits',
];

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
    flaggedOrphans: 0,
    unflaggedOrphans: 0,
    removedOrphans: 0,
    skippedEdits: 0,
    filesScanned: 0,
    linkedTasks: 0,
    projectResolution,
  };
}

/** Sums each part of a run into one outcome, since a project is resolved only once per run. */
export function mergeOutcomes(outcomes: readonly SyncOutcome[], projectResolution: ProjectResolution): SyncOutcome {
  const total = emptyOutcome(projectResolution);

  for (const outcome of outcomes) {
    for (const counter of COUNTERS) {
      total[counter] += outcome[counter];
    }
  }

  return total;
}

/** A conflict alone changes nothing: it is always settled by the push or pull counted beside it. */
export function changedAnything(outcome: SyncOutcome): boolean {
  return COUNTERS.some((counter) => counter !== 'conflicted' && outcome[counter] > 0);
}
