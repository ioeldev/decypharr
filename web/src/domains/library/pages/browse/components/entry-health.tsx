import { request } from '../../../../../shared/api/client';
import { useApiResource } from '../../../../../shared/hooks/use-api-resource';
import { useAction } from '../../../../../shared/hooks/use-action';
import ActionMessage from '../../../../../shared/components/action-message';
import { healthSchema } from '../../../library.api';

export default function EntryHealth({ name }: { name: string }) {
  const health = useApiResource({ path: `api/repair/health/${encodeURIComponent(name)}`, parse: healthSchema.parse });
  const action = useAction();

  return <div className="space-y-1">
    <span className="badge" title={health.state.kind === 'ready' ? health.state.value.failure_reason : undefined}>
      {health.state.kind === 'ready' ? health.state.value.status ?? 'Unknown' : 'Unknown'}
    </span>
    <button className="btn btn-xs" disabled={action.isPending} onClick={() => action.run(async () => {
      await request(`api/repair/health/${encodeURIComponent(name)}/check`, { method: 'POST' });
      health.reload();
      return 'Recheck requested.';
    })}>Recheck</button>
    <ActionMessage state={action.state} />
  </div>;
}
