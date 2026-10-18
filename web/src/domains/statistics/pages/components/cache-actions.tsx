import { request } from '../../../../shared/api/client';
import { useAction } from '../../../../shared/hooks/use-action';
import ActionMessage from '../../../../shared/components/action-message';

export default function CacheActions() {
  const action = useAction();
  return <div className="space-y-3"><div className="flex gap-3">
    <button className="btn btn-sm" disabled={action.isPending} onClick={() => action.run(async () => { await request('api/mount/cache/cleanup', { method: 'POST' }); return 'Cache cleanup completed.'; })}>Clean Up Cache</button>
    <button className="btn btn-sm btn-warning" disabled={action.isPending} onClick={() => {
      if (!confirm('Purge the mount cache? Cached data will need to be downloaded again.')) return;
      action.run(async () => { await request('api/mount/cache/purge', { method: 'POST' }); return 'Cache purged.'; });
    }}>Purge Cache</button>
  </div><ActionMessage state={action.state} /></div>;
}
