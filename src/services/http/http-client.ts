export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  text: string;
}

export interface HttpClient {
  send(request: HttpRequest): Promise<HttpResponse>;
}
