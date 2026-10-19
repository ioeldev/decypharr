import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../shared/api/client';
import { jsonObjectSchema } from '../../shared/api/json-response';

export const statisticsKeys = { all: ['statistics'] as const };

export function statisticsQuery() {
  return queryOptions({
    queryKey: statisticsKeys.all,
    queryFn: ({ signal }) => requestJson('debug/stats', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(jsonObjectSchema.parse),
    refetchInterval: 30000,
  });
}
