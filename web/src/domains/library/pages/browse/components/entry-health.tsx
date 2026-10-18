import { entryHealthQuery } from '../../../../repair/repair.queries';
import { request } from '../../../../../shared/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../../shared/components/action-message';

export default function EntryHealth({ name }: { name: string }) {
  const health = useQuery(entryHealthQuery(name));
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['repair', 'health'] }),
  });

  return <div className="space-y-1">
    <span className="badge" title={health.data !== undefined ? health.data.failure_reason : undefined}>
      {health.data !== undefined ? health.data.status ?? 'Unknown' : 'Unknown'}
    </span>
    <button className="btn btn-xs" disabled={action.isPending} onClick={() => action.mutate(async () => {
      await request(`api/repair/health/${encodeURIComponent(name)}/check`, { method: 'POST' });
      return 'Recheck requested.';
    })}>Recheck</button>
    <ActionMessage state={action} />
  </div>;
}
