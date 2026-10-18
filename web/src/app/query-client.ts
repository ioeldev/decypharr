import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../shared/api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: true,
      retry: (failureCount, error) => failureCount < 1 && (error instanceof TypeError || (error instanceof ApiError && error.status >= 500)),
    },
    // Retrying a command can repeat destructive work even if its response was lost.
    mutations: { retry: false, networkMode: 'always' },
  },
});
