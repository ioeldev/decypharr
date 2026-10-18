import { request } from '../../../../../shared/api/client';
import { stringValue } from '../../../../../shared/api/json-response';
import { useApiResource } from '../../../../../shared/hooks/use-api-resource';
import { useAction } from '../../../../../shared/hooks/use-action';
import ActionMessage from '../../../../../shared/components/action-message';
import RecordDetails from '../../../../../shared/components/record-details';
import { presentRun } from '../run-presentation';
import { recordsSchema } from '../../../repair.api';

export default function RunHistory() {
  const history = useApiResource({ path: 'api/repair/runs', parse: recordsSchema.parse, pollIntervalMs: 15000 });
  const action = useAction();
  if (history.state.kind === 'loading') return <p>Loading run history…</p>;
  if (history.state.kind === 'error') return <p role="alert">{history.state.message}</p>;

  return <section className="card bg-base-100 p-5 space-y-4">
    <h2 className="text-xl">Run History</h2>
    <div className="flex gap-2"><button className="btn btn-sm" onClick={() => history.reload()}>Refresh</button>
      <button className="btn btn-sm" disabled={action.isPending} onClick={() => {
        if (!confirm('Clear all run history?')) return;
        action.run(async () => { await request('api/repair/runs', { method: 'DELETE' }); history.reload(); return 'History cleared.'; });
      }}>Clear History</button></div>
    {history.state.value.length === 0 ? <p>No runs yet.</p> : history.state.value.map(presentRun).map((run, index) => <details className="collapse collapse-arrow bg-base-200" key={stringValue(run.id) || index}>
      <summary className="collapse-title">{stringValue(run.started_at)} · {stringValue(run.status)} · {stringValue(run.source)}</summary>
      <div className="collapse-content"><RecordDetails value={run} /></div>
    </details>)}
    <ActionMessage state={action.state} />
  </section>;
}
