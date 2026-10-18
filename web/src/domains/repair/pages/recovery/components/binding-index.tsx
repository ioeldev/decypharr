import { request } from '../../../../../shared/api/client';
import { useApiResource } from '../../../../../shared/hooks/use-api-resource';
import { useAction } from '../../../../../shared/hooks/use-action';
import ActionMessage from '../../../../../shared/components/action-message';
import RecordDetails from '../../../../../shared/components/record-details';
import { recordsSchema } from '../../../repair.api';

export default function BindingIndex() {
  const index = useApiResource({ path: 'api/arr/index', parse: recordsSchema.parse, pollIntervalMs: 15000 });
  const action = useAction();
  return <section className="card bg-base-100 p-5 space-y-3"><h2 className="text-xl">Arr Binding Index</h2>
    <button className="btn btn-sm w-fit" disabled={action.isPending} onClick={() => action.run(async () => { await request('api/arr/index/refresh', { method: 'POST' }); index.reload(); return 'Index refresh queued.'; })}>Rebuild Index</button>
    {index.state.kind === 'ready' ? <RecordDetails value={index.state.value} /> : null}
    {index.state.kind === 'error' ? <p role="alert">{index.state.message}</p> : null}
    <ActionMessage state={action.state} />
  </section>;
}
