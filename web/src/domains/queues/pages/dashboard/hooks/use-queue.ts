import { useEffect, useState } from 'react';
import { getQueue } from '../../../queues.api';
import type { QueueFilters, QueuePage } from '../../../queues.types';
import { ApiError } from '../../../../../shared/api/client';

type QueueState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: QueuePage }
  | { kind: 'error'; message: string; requiresLogin: boolean };

export function useQueue(filters: QueueFilters) {
  const [state, setState] = useState<QueueState>({ kind: 'loading' });
  const [refreshId, setRefreshId] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimeout: ReturnType<typeof setTimeout>;
    setState({ kind: 'loading' });

    function loadQueue(): void {
      getQueue(filters, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
        .then((page) => {
          if (controller.signal.aborted) return;

          setState({ kind: 'ready', page });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;

          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Unable to load the queue.',
            requiresLogin: error instanceof ApiError && error.status === 401,
          });
        })
        .finally(() => {
          if (controller.signal.aborted) return;

          refreshTimeout = setTimeout(loadQueue, 10_000);
        });
    }

    // Debounce search and cancel obsolete requests when filters change.
    refreshTimeout = setTimeout(loadQueue, 300);

    return () => {
      controller.abort();
      clearTimeout(refreshTimeout);
    };
  }, [filters, refreshId]);

  return { state, refresh: () => setRefreshId((previous) => previous + 1) };
}
