import { statisticsKeys } from '../../statistics.queries';
import { request } from '../../../../shared/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../shared/components/action-message';

export default function CacheActions() {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: statisticsKeys.all }),
  });
  return <div className="space-y-3"><div className="flex gap-3">
    <button className="btn btn-sm" disabled={action.isPending} onClick={() => action.mutate(async () => { await request('api/mount/cache/cleanup', { method: 'POST' }); return 'Cache cleanup completed.'; })}>Clean Up Cache</button>
    <button className="btn btn-sm btn-warning" disabled={action.isPending} onClick={() => {
      if (!confirm('Purge the mount cache? Cached data will need to be downloaded again.')) return;
      action.mutate(async () => { await request('api/mount/cache/purge', { method: 'POST' }); return 'Cache purged.'; });
    }}>Purge Cache</button>
  </div><ActionMessage state={action} /></div>;
}
