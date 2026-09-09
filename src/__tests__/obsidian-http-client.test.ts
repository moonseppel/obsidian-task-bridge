import * as obsidian from 'obsidian';
import { ObsidianHttpClient } from '../services/http/obsidian-http-client';

const REQUEST = {
  url: 'https://api.todoist.com/api/v1/user',
  method: 'GET',
  headers: { Authorization: 'Bearer test-token' },
};

function responsePromise(status: number, text: string): obsidian.RequestUrlResponsePromise {
  const response: obsidian.RequestUrlResponse = {
    status,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: null,
    text,
  };
  const promise = Promise.resolve(response) as obsidian.RequestUrlResponsePromise;

  promise.arrayBuffer = Promise.resolve(response.arrayBuffer);
  promise.json = Promise.resolve(response.json);
  promise.text = Promise.resolve(response.text);

  return promise;
}

function spyOnRequestUrl(status = 200, text = '{}'): jest.SpyInstance {
  return jest.spyOn(obsidian, 'requestUrl').mockImplementation(() => responsePromise(status, text));
}

function firstRequestParam(spy: jest.SpyInstance): obsidian.RequestUrlParam {
  return spy.mock.calls[0][0] as obsidian.RequestUrlParam;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ObsidianHttpClient', () => {
  it('routes the request through Obsidian rather than fetch', async () => {
    const requestUrl = spyOnRequestUrl();
    await new ObsidianHttpClient().send(REQUEST);
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });

  it('lets error statuses come back as data so they can be mapped', async () => {
    const requestUrl = spyOnRequestUrl();
    await new ObsidianHttpClient().send(REQUEST);
    expect(firstRequestParam(requestUrl).throw).toBe(false);
  });

  it('forwards the authorization header', async () => {
    const requestUrl = spyOnRequestUrl();
    await new ObsidianHttpClient().send(REQUEST);
    expect(firstRequestParam(requestUrl).headers).toEqual(REQUEST.headers);
  });

  it('returns the response status', async () => {
    spyOnRequestUrl(401, '{"error":"Unauthorized"}');
    await expect(new ObsidianHttpClient().send(REQUEST)).resolves.toMatchObject({ status: 401 });
  });

  it('returns the response body untouched', async () => {
    spyOnRequestUrl(200, '{"id":"1"}');
    await expect(new ObsidianHttpClient().send(REQUEST)).resolves.toMatchObject({ text: '{"id":"1"}' });
  });
});
