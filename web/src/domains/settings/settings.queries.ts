import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../shared/api/client';
import { jsonObjectSchema } from '../../shared/api/json-response';

export const settingsKeys = { all: ['settings'] as const };

export function configurationQuery() {
  return queryOptions({
    staleTime: 0,
    queryKey: [...settingsKeys.all, 'configuration'],
    queryFn: ({ signal }) => requestJson('api/config', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(jsonObjectSchema.parse),
  });
}
