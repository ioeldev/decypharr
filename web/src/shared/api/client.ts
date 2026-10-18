export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiRequestOptions = RequestInit & { json?: unknown };

export function appUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), document.baseURI).toString();
}

export async function request(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { json, ...requestOptions } = options;
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (json !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(appUrl(path), {
    ...requestOptions,
    credentials: 'same-origin',
    headers,
    body: json === undefined ? options.body : JSON.stringify(json),
  });

  if (!response.ok) throw new ApiError(await readError(response), response.status);

  return response;
}

export async function requestJson(path: string, options?: ApiRequestOptions): Promise<unknown> {
  const response = await request(path, options);

  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new ApiError('Expected a JSON response from the server.', response.status);
  }

  return response.json();
}

async function readError(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status}).`;
  const contentType = response.headers.get('Content-Type') ?? '';

  if (contentType.includes('application/json')) {
    const body: unknown = await response.json().catch(() => null);

    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }

    return fallback;
  }

  if (contentType.includes('text/plain')) return (await response.text()).trim() || fallback;

  return fallback;
}
