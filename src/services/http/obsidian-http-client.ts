import { requestUrl } from 'obsidian';
import { HttpClient, HttpRequest, HttpResponse } from './http-client';

/** Obsidian's own transport, rather than `fetch`, so requests are CORS-free and work on mobile. */
export class ObsidianHttpClient implements HttpClient {
  async send(request: HttpRequest): Promise<HttpResponse> {
    const response = await requestUrl({
      url: request.url,
      method: request.method,
      headers: request.headers,
      throw: false,
    });

    return { status: response.status, text: response.text };
  }
}
