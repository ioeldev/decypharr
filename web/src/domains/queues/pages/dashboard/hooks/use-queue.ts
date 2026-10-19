import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queueQuery } from '../../../queues.queries';
import type { QueueFilters } from '../../../queues.types';

export function useQueue(filters: QueueFilters) {
  const [search, setSearch] = useState(filters.search);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(filters.search), 300);
    return () => clearTimeout(timeout);
  }, [filters.search]);

  return useQuery(queueQuery({ ...filters, search }));
}
