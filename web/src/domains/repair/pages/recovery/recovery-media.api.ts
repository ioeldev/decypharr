import { requestJson } from '../../../../shared/api/client';
import { jsonObjectSchema, type JsonObject } from '../../../../shared/api/json-response';

const waiting: Array<() => void> = [];
let activeRequests = 0;

export async function getRecoveryMedia(parameters: string, signal: AbortSignal): Promise<JsonObject> {
  await reserveRequest(signal);
  try {
    signal.throwIfAborted();
    return jsonObjectSchema.parse(await requestJson(`api/arr/media/details?${parameters}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    }));
  } finally {
    activeRequests -= 1;
    waiting.shift()?.();
  }
}

// Query handles caching and deduplication; this only caps simultaneous Arr lookups.
function reserveRequest(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (activeRequests < 2) {
    activeRequests += 1;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    function start(): void {
      signal.removeEventListener('abort', cancel);
      activeRequests += 1;
      resolve();
    }
    function cancel(): void {
      const index = waiting.indexOf(start);
      if (index >= 0) waiting.splice(index, 1);
      reject(signal.reason);
    }
    waiting.push(start);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
