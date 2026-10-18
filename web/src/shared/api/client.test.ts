import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test';
import { ApiError, appUrl, request, requestJson } from './client';

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/decypharr/' } });
let fetchSpy = spyOn(globalThis, 'fetch');

afterEach(() => fetchSpy.mockRestore());

afterAll(() => {
  if (originalDocument) {
    Object.defineProperty(globalThis, 'document', originalDocument);
    return;
  }

  Reflect.deleteProperty(globalThis, 'document');
});

describe('API client', () => {
  test('keeps requests under the configured application prefix', () => {
    expect(appUrl('/api/torrents?page=2')).toBe('https://example.test/decypharr/api/torrents?page=2');
  });

  test('sends JSON with same-origin session credentials', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ok: true }));
    await requestJson('api/config', { method: 'POST', json: { enabled: true } });

    const options = fetchSpy.mock.calls[0]?.[1];
    expect(options?.credentials).toBe('same-origin');
    expect(options?.body).toBe('{"enabled":true}');
    expect(new Headers(options?.headers).get('Content-Type')).toBe('application/json');
  });

  test('lets the browser supply multipart boundaries and supports empty success responses', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const body = new FormData();
    body.set('urls', 'magnet:?xt=urn:btih:example');
    const response = await request('api/add', { method: 'POST', body });

    expect(response.status).toBe(204);
    const options = fetchSpy.mock.calls[0]?.[1];
    expect(options?.body).toBe(body);
    expect(new Headers(options?.headers).has('Content-Type')).toBe(false);
  });

  test('preserves JSON error messages and status codes', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'Session expired' }, { status: 401 }));
    await expect(requestJson('api/torrents')).rejects.toMatchObject({ message: 'Session expired', status: 401 });
  });

  test('preserves plain-text Go errors', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Queue is unavailable\n', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    await expect(request('api/torrents')).rejects.toThrow('Queue is unavailable');
  });

  test('rejects HTML login responses instead of treating them as API data', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Login</html>', {
      headers: { 'Content-Type': 'text/html' },
    }));
    await expect(requestJson('api/torrents')).rejects.toBeInstanceOf(ApiError);
  });

  test('passes cancellation to fetch', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([]));
    const controller = new AbortController();
    await requestJson('api/torrents', { signal: controller.signal });
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
