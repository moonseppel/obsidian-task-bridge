import { Logger, setDebugLogging } from '../utils/logger';

const BELL = String.fromCharCode(7);

describe('Logger', () => {
  afterEach(() => {
    setDebugLogging(false);
    jest.restoreAllMocks();
  });

  it('prefixes every message with its namespace', () => {
    const info = jest.spyOn(console, 'info').mockImplementation();

    new Logger('Test').info('Hello');

    expect(info).toHaveBeenCalledWith('[Test] Hello');
  });

  it('makes a logged string from outside the plugin safe to display', () => {
    const info = jest.spyOn(console, 'info').mockImplementation();

    new Logger('Test').info('Label', `bad${BELL}value`);

    expect(info).toHaveBeenCalledWith('[Test] Label', 'bad value');
  });

  it('makes the string fields of a logged object safe to display', () => {
    const info = jest.spyOn(console, 'info').mockImplementation();

    new Logger('Test').info('Label', { path: `a${BELL}b`, count: 2 });

    expect(info).toHaveBeenCalledWith('[Test] Label', { path: 'a b', count: 2 });
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
