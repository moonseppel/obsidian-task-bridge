import { Logger, setDebugLogging } from '../../utils/logger';

const BELL = String.fromCharCode(7);
const NOW = '2026-09-16T12:34:56.789Z';

describe('Logger', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    jest.useRealTimers();
    setDebugLogging(false);
    jest.restoreAllMocks();
  });

  it('stamps every message with the time it was logged, in UTC', () => {
    const info = jest.spyOn(console, 'info').mockImplementation();
    jest.setSystemTime(new Date('2027-01-02T03:04:05.006Z'));

    new Logger('Test').info('Hello');

    expect(info).toHaveBeenCalledWith('[2027-01-02T03:04:05.006Z] [Test] Hello');
  });

  it('prefixes every message with its namespace', () => {
    const info = jest.spyOn(console, 'info').mockImplementation();

    new Logger('Test').info('Hello');

    expect(info).toHaveBeenCalledWith(`[${NOW}] [Test] Hello`);
  });

  it('makes a logged string from outside the plugin safe to display', () => {
    const info = jest.spyOn(console, 'info').mockImplementation();

    new Logger('Test').info('Label', `bad${BELL}value`);

    expect(info).toHaveBeenCalledWith(`[${NOW}] [Test] Label`, 'bad value');
  });

  it('makes the string fields of a logged object safe to display', () => {
    const info = jest.spyOn(console, 'info').mockImplementation();

    new Logger('Test').info('Label', { path: `a${BELL}b`, count: 2 });

    expect(info).toHaveBeenCalledWith(`[${NOW}] [Test] Label`, { path: 'a b', count: 2 });
  });

  it('keeps a logged error whole, so its stack survives', () => {
    const error = jest.spyOn(console, 'error').mockImplementation();
    const failure = new Error('boom');

    new Logger('Test').error('Failed', failure);

    expect(error.mock.calls[0][1]).toBe(failure);
  });

  it('stays silent at debug unless debug logging is switched on', () => {
    const debug = jest.spyOn(console, 'debug').mockImplementation();

    new Logger('Test').debug('Detail');

    expect(debug).not.toHaveBeenCalled();
  });
});
