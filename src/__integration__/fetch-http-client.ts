import { HttpClient, HttpRequest, HttpResponse } from '../services/http/http-client';

export class FetchHttpClient implements HttpClient {
  async send(request: HttpRequest): Promise<HttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
    });

    return { status: response.status, text: await response.text() };
  }
}
