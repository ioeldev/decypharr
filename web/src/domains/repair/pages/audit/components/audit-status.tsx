import { jsonObjectSchema, objectValue, numberValue, stringValue } from '../../../../../shared/api/json-response';
import { useApiResource } from '../../../../../shared/hooks/use-api-resource';
import RecordDetails from '../../../../../shared/components/record-details';
import { presentRun } from '../run-presentation';
import { healthStates } from '../../../repair.api';

export default function AuditStatus() {
  const status = useApiResource({ path: 'api/repair/status', parse: jsonObjectSchema.parse, pollIntervalMs: 2000 });
  if (status.state.kind === 'loading') return <p>Loading health status…</p>;
  if (status.state.kind === 'error') return <p role="alert">{status.state.message}</p>;

  const snapshot = status.state.value;
  const counts = objectValue(snapshot.health_counts);
  return <section className="card bg-base-100 p-5 space-y-4">
    <p>{snapshot.enabled ? `Repair enabled. Next run: ${stringValue(snapshot.next_run_at) || 'Not scheduled'}` : 'Scheduled repair is disabled. You can still run a one-off check.'}</p>
    <div className="flex gap-3">{healthStates.map((state) => <div className="stat bg-base-200" key={state}><div className="stat-title">{state}</div><div className="stat-value text-xl">{numberValue(counts[state])}</div></div>)}</div>
    {snapshot.active_run ? <div><h2 className="text-xl">Active run</h2><RecordDetails value={presentRun(objectValue(snapshot.active_run))} /></div> : null}
  </section>;
}
