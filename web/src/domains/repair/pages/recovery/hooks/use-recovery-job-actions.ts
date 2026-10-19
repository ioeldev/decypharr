import { useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '@/shared/api/client';
import { stringValue, type JsonObject } from '@/shared/api/json-response';
import { repairKeys } from '../../../repair.queries';

type JobOperation = 'retry' | 'pause' | 'acknowledge';

export function useRecoveryJobActions(job: JsonObject) {
  const queryClient = useQueryClient();
  const path = `api/arr/reacquire/jobs/${encodeURIComponent(stringValue(job.id))}`;

  return useMutation({
    mutationFn: async (operation: JobOperation): Promise<string> => {
      if (operation === 'retry') {
        await request(`${path}/retry`, { method: 'POST', json: {} });
        return 'Retry requested.';
      }

      if (operation === 'pause') {
        await request(`${path}/pause`, { method: 'POST', json: { paused: !job.paused } });
        return job.paused ? 'Resume requested.' : 'Suspension requested.';
      }

      await request(`${path}/acknowledge`, { method: 'POST' });
      return 'Arr actions acknowledged.';
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
}
