export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  contentType?: string;
}

export interface HttpResponse {
  status: number;
  text: string;
}

export interface HttpClient {
  send(request: HttpRequest): Promise<HttpResponse>;
}
