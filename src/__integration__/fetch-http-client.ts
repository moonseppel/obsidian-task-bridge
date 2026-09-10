import { HttpClient, HttpRequest, HttpResponse } from '../services/http/http-client';

export class FetchHttpClient implements HttpClient {
  async send(request: HttpRequest): Promise<HttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: withContentType(request),
      body: request.body,
    });

    return { status: response.status, text: await response.text() };
  }
}

function withContentType(request: HttpRequest): Record<string, string> {
  return request.contentType === undefined
    ? request.headers
    : { ...request.headers, 'Content-Type': request.contentType };
}
