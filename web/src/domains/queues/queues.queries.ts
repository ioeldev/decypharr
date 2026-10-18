import { queryOptions } from '@tanstack/react-query';
import { getQueue } from './queues.api';
import type { QueueFilters } from './queues.types';

export const queuesKeys = { all: ['queues'] as const };

export function queueQuery(filters: QueueFilters) {
  return queryOptions({
    queryKey: [...queuesKeys.all, filters],
    queryFn: ({ signal }) => getQueue(filters, AbortSignal.any([signal, AbortSignal.timeout(15000)])),
    refetchInterval: 10000,
  });
}
