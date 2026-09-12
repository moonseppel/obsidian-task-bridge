import { StatusReporter } from '../services/status-reporter';
import { SyncOutcome } from '../services/sync/sync-outcome';
import { Logger } from '../utils/logger';

function outcomeWith(overrides: Partial<SyncOutcome> = {}): SyncOutcome {
  return {
    created: 0,
    pushed: 0,
    pulled: 0,
    conflicted: 0,
    removedLine: 0,
    removedTask: 0,
    recreatedTask: 0,
    resurrectedLine: 0,
    projectResolution: { kind: 'configured' },
    ...overrides,
  };
}

describe('StatusReporter.reportSyncOutcome', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs at debug when every counter is zero', () => {
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const info = jest.spyOn(Logger.prototype, 'info').mockImplementation();
    const reporter = new StatusReporter(new Logger('test'), () => undefined);

    reporter.reportSyncOutcome(outcomeWith());

    expect(debug).toHaveBeenCalledWith('Task sync finished with nothing to do');
    expect(info).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<SyncOutcome>]>([
    ['created', { created: 1 }],
    ['pushed', { pushed: 1 }],
    ['pulled', { pulled: 1 }],
    ['removedLine', { removedLine: 1 }],
    ['removedTask', { removedTask: 1 }],
    ['recreatedTask', { recreatedTask: 1 }],
    ['resurrectedLine', { resurrectedLine: 1 }],
  ])('logs at info, not debug, when %s is non-zero', (_name, overrides) => {
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const info = jest.spyOn(Logger.prototype, 'info').mockImplementation();
    const reporter = new StatusReporter(new Logger('test'), () => undefined);
    const outcome = outcomeWith(overrides);

    reporter.reportSyncOutcome(outcome);

    expect(info).toHaveBeenCalledWith('Task sync finished', outcome);
    expect(debug).not.toHaveBeenCalled();
  });
});
