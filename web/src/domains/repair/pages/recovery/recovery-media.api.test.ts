import { afterEach, expect, test } from 'bun:test';
import { getRecoveryMedia } from './recovery-media.api';

const originalFetch = globalThis.fetch;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  if (!originalDocument) Reflect.deleteProperty(globalThis, 'document');
});

test('Arr lookups stay bounded and cancelled waiting requests never reach the server', async () => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/base/' } });
  const completions: Array<() => void> = [];
  let requests = 0;
  globalThis.fetch = Object.assign(async () => {
    requests += 1;
    await new Promise<void>((resolve) => completions.push(resolve));
    return Response.json({ title: 'Example' });
  }, { preconnect: originalFetch.preconnect });
  const first = getRecoveryMedia('media=1', new AbortController().signal);
  const second = getRecoveryMedia('media=2', new AbortController().signal);
  const controller = new AbortController();
  const cancelled = getRecoveryMedia('media=3', controller.signal).catch((error: unknown) => error);
  const fourth = getRecoveryMedia('media=4', new AbortController().signal);
  await Promise.resolve();
  expect(requests).toBe(2);
  controller.abort();
  expect(await cancelled).toBeInstanceOf(DOMException);
  completions.shift()?.();
  await first;
  await Promise.resolve();
  expect(requests).toBe(3);
  completions.shift()?.();
  completions.shift()?.();
  await Promise.all([second, fourth]);
});
