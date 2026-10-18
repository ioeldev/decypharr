import { afterEach, expect, test } from 'bun:test';
import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query';
import { queryClient } from './query-client';
import { ApiError } from '../shared/api/client';
import { configurationQuery } from '../domains/settings/settings.queries';
import { downloadConfigSchema } from '../domains/downloads/downloads.api';
import { recoveryJobsQuery, repairKeys } from '../domains/repair/repair.queries';

const originalFetch = globalThis.fetch;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const clients: QueryClient[] = [];
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  if (!originalDocument) Reflect.deleteProperty(globalThis, 'document');
  for (const client of clients) client.clear();
  clients.length = 0;
  onlineManager.setOnline(true);
});

test('configuration observers deduplicate requests without losing settings-only fields', async () => {
  const client = testClient();
  let requests = 0;
  mockFetch(async () => { requests += 1; return Response.json({ download_folder: '/downloads', repair: { enabled: true } }); });
  const [first, second] = await Promise.all([client.fetchQuery(configurationQuery()), client.fetchQuery(configurationQuery())]);
  expect(requests).toBe(1);
  expect(first).toEqual(second);
  const downloads = new QueryObserver(client, { ...configurationQuery(), select: downloadConfigSchema.parse });
  expect(downloads.getCurrentResult().data).toEqual({ download_folder: '/downloads' });
  expect(client.getQueryData(configurationQuery().queryKey)).toHaveProperty('repair');
});

test('repair invalidation refetches active jobs while retaining previous data after failure', async () => {
  const client = testClient();
  let requests = 0;
  mockFetch(async () => { requests += 1; return Response.json([{ id: 'job', status: requests === 1 ? 'needs_attention' : 'queued' }]); });
  await client.fetchQuery(recoveryJobsQuery());
  const observer = new QueryObserver(client, recoveryJobsQuery());
  const unsubscribe = observer.subscribe(() => {});
  await client.invalidateQueries({ queryKey: repairKeys.all });
  expect(requests).toBe(2);
  expect(observer.getCurrentResult().data?.[0]?.status).toBe('queued');

  mockFetch(async () => Response.json({ error: 'Unauthorized' }, { status: 401 }));
  await client.invalidateQueries({ queryKey: repairKeys.all });
  expect(observer.getCurrentResult().isError).toBe(true);
  expect(observer.getCurrentResult().data?.[0]?.status).toBe('queued');
  unsubscribe();
});

test('query cancellation reaches fetch', async () => {
  const client = testClient();
  let wasAborted = false;
  mockFetch((_input, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => { wasAborted = true; reject(options.signal?.reason); }, { once: true });
  }));
  const response = client.fetchQuery(recoveryJobsQuery()).catch(() => undefined);
  await client.cancelQueries({ queryKey: repairKeys.all });
  await response;
  expect(wasAborted).toBe(true);
});

test('authentication failures and mutation commands are not retried', async () => {
  const client = testClient();
  let requests = 0;
  mockFetch(async () => { requests += 1; return Response.json({ error: 'Unauthorized' }, { status: 401 }); });
  await expect(client.fetchQuery(configurationQuery())).rejects.toBeInstanceOf(ApiError);
  expect(requests).toBe(1);
  onlineManager.setOnline(false);
  let commands = 0;
  const mutation = client.getMutationCache().build(client, { mutationFn: async () => { commands += 1; throw new Error('Response lost'); } });
  await expect(mutation.execute(undefined)).rejects.toThrow('Response lost');
  expect(commands).toBe(1);
});

function testClient(): QueryClient {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/base/' } });
  const client = new QueryClient({ defaultOptions: queryClient.getDefaultOptions() });
  clients.push(client);
  return client;
}

function mockFetch(implementation: (input: Parameters<typeof fetch>[0], options?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = Object.assign(implementation, { preconnect: originalFetch.preconnect });
}
