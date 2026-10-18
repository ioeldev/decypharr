import { useEffect, useState } from 'react';
import { requestJson } from '../../../../../shared/api/client';
import { jsonObjectSchema, numberValue, stringValue, type JsonObject } from '../../../../../shared/api/json-response';

// A season can have many jobs for the same series. Share these lookups and limit Arr traffic.
const cache = new Map<string, { expiresAt: number; response: Promise<JsonObject> }>();
const waiting: Array<() => void> = [];
let activeRequests = 0;

export function useRecoveryMedia(binding: JsonObject): JsonObject {
  const [details, setDetails] = useState<JsonObject>({});
  const mediaId = numberValue(binding.movieId) || numberValue(binding.seriesId);
  const parameters = new URLSearchParams({ arr: stringValue(binding.arrName), media: String(mediaId), fingerprint: stringValue(binding.arrInstanceFingerprint) }).toString();
  const canLoad = mediaId > 0 && Boolean(binding.arrName) && ['sonarr', 'radarr'].includes(stringValue(binding.arrType));

  useEffect(() => {
    let isCurrent = true;
    setDetails({});
    if (!canLoad) return;

    loadMedia(parameters).then((response) => {
      if (isCurrent) setDetails(response);
    }).catch(() => {
      // The path-based label remains useful when Arr is offline. Failures are cached briefly.
    });
    return () => { isCurrent = false; };
  }, [parameters, canLoad]);

  return details;
}

function loadMedia(parameters: string): Promise<JsonObject> {
  const cached = cache.get(parameters);
  if (cached && cached.expiresAt > Date.now()) return cached.response;

  const response = new Promise<void>((resolve) => {
    if (activeRequests >= 2) { waiting.push(resolve); return; }
    activeRequests += 1;
    resolve();
  }).then(() => requestJson(`api/arr/media/details?${parameters}`, { signal: AbortSignal.timeout(15000) }))
    .then(jsonObjectSchema.parse)
    .catch((error: unknown) => {
      const entry = cache.get(parameters);
      if (entry) entry.expiresAt = Date.now() + 60000;
      throw error;
    })
    .finally(() => {
      const next = waiting.shift();
      if (next) { next(); return; }
      activeRequests -= 1;
    });
  cache.set(parameters, { expiresAt: Date.now() + 300000, response });
  return response;
}
