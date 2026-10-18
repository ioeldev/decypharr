import { afterAll, expect, test } from 'bun:test';
import { queryClient } from './query-client';
import { loadSession } from './session-loader';

const originalFetch = globalThis.fetch;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
afterAll(() => {
  queryClient.clear();
  globalThis.fetch = originalFetch;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  if (!originalDocument) Reflect.deleteProperty(globalThis, 'document');
});

test('route guards use router-relative destinations without registration loops', async () => {
  for (const prefix of ['', '/base']) {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: `https://example.test${prefix}/` } });
    for (const scenario of [
      { path: '/', authenticated: false, needs_registration: true, setup_required: false, destination: '/register' },
      { path: '/register', authenticated: false, needs_registration: true, setup_required: false, destination: null },
      { path: '/repair', authenticated: false, needs_registration: false, setup_required: false, destination: '/login' },
      { path: '/login', authenticated: false, needs_registration: false, setup_required: false, destination: null },
      { path: '/login', authenticated: true, needs_registration: false, setup_required: false, destination: '/' },
      { path: '/settings', authenticated: true, needs_registration: false, setup_required: true, destination: '/setup' },
      { path: '/setup', authenticated: false, needs_registration: true, setup_required: true, destination: null },
    ]) {
      globalThis.fetch = Object.assign(async () => Response.json({ ...scenario, token_only: false }), { preconnect: originalFetch.preconnect });
      queryClient.setQueryData(['settings', 'configuration'], { api_token: 'cached-secret' });
      const result = await loadSession({ request: new Request(`https://example.test${prefix}${scenario.path}`) });
      if (!scenario.authenticated || scenario.setup_required || scenario.needs_registration) {
        expect(queryClient.getQueryData(['settings', 'configuration'])).toBeUndefined();
      }
      if (scenario.destination) {
        expect(result instanceof Response).toBe(true);
        if (result instanceof Response) expect(result.headers.get('Location')).toBe(scenario.destination);
        continue;
      }
      expect(result instanceof Response).toBe(false);
    }
  }
});
