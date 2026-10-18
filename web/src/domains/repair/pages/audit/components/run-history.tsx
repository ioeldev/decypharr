import { repairKeys, repairHistoryQuery } from '../../../repair.queries';
import { request } from '../../../../../shared/api/client';
import { stringValue } from '../../../../../shared/api/json-response';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../../shared/components/action-message';
import RecordDetails from '../../../../../shared/components/record-details';
import { presentRun } from '../run-presentation';

export default function RunHistory() {
  const history = useQuery(repairHistoryQuery());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  if (history.isPending) return <p>Loading run history…</p>;
  if (history.isError && !history.data) return <p role="alert">{history.error.message}</p>;

  return <section className="card bg-base-100 p-5 space-y-4">
    {history.isError ? <p role="alert">{history.error.message} Showing the last received data.</p> : null}
    <h2 className="text-xl">Run History</h2>
    <div className="flex gap-2"><button className="btn btn-sm" onClick={() => void history.refetch()}>Refresh</button>
      <button className="btn btn-sm" disabled={action.isPending} onClick={() => {
        if (!confirm('Clear all run history?')) return;
        action.mutate(async () => { await request('api/repair/runs', { method: 'DELETE' }); return 'History cleared.'; });
      }}>Clear History</button></div>
    {history.data.length === 0 ? <p>No runs yet.</p> : history.data.map(presentRun).map((run, index) => <details className="collapse collapse-arrow bg-base-200" key={stringValue(run.id) || index}>
      <summary className="collapse-title">{stringValue(run.started_at)} · {stringValue(run.status)} · {stringValue(run.source)}</summary>
      <div className="collapse-content"><RecordDetails value={run} /></div>
    </details>)}
    <ActionMessage state={action} />
  </section>;
}
