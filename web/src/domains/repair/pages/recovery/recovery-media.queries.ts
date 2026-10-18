import { queryOptions } from '@tanstack/react-query';
import { numberValue, stringValue, type JsonObject } from '../../../../shared/api/json-response';
import { getRecoveryMedia } from './recovery-media.api';

export function recoveryMediaQuery(binding: JsonObject) {
  const mediaId = numberValue(binding.movieId) || numberValue(binding.seriesId);
  const parameters = new URLSearchParams({ arr: stringValue(binding.arrName), media: String(mediaId), fingerprint: stringValue(binding.arrInstanceFingerprint) }).toString();
  return queryOptions({
    queryKey: ['arr-media', parameters],
    queryFn: ({ signal }) => getRecoveryMedia(parameters, signal),
    enabled: mediaId > 0 && Boolean(binding.arrName) && ['sonarr', 'radarr'].includes(stringValue(binding.arrType)),
    staleTime: 300000,
    retry: false,
    refetchOnReconnect: false,
    // Offline Arr instances should not receive the same failed lookup on every page change.
    refetchOnMount: (query) => !query.state.error || Date.now() - query.state.errorUpdatedAt > 60000,
  });
}
