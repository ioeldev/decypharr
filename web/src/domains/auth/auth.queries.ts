import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../shared/api/client';
import { sessionSchema } from './auth.api';

export function sessionQuery() {
  return queryOptions({
    queryKey: ['auth', 'session'],
    queryFn: ({ signal }) => requestJson('api/ui', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(sessionSchema.parse),
  });
}
