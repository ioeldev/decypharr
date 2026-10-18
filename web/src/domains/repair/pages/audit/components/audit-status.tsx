import { repairStatusQuery } from '../../../repair.queries';
import { objectValue, numberValue, stringValue } from '../../../../../shared/api/json-response';
import { useQuery } from '@tanstack/react-query';
import RecordDetails from '../../../../../shared/components/record-details';
import { presentRun } from '../run-presentation';
import { healthStates } from '../../../repair.api';

export default function AuditStatus() {
  const status = useQuery(repairStatusQuery());
  if (status.isPending) return <p>Loading health status…</p>;
  if (status.isError && !status.data) return <p role="alert">{status.error.message}</p>;

  const snapshot = status.data;
  const counts = objectValue(snapshot.health_counts);
  return <section className="card bg-base-100 p-5 space-y-4">
    {status.isError ? <p role="alert">{status.error.message} Showing the last received data.</p> : null}
    <p>{snapshot.enabled ? `Repair enabled. Next run: ${stringValue(snapshot.next_run_at) || 'Not scheduled'}` : 'Scheduled repair is disabled. You can still run a one-off check.'}</p>
    <div className="flex gap-3">{healthStates.map((state) => <div className="stat bg-base-200" key={state}><div className="stat-title">{state}</div><div className="stat-value text-xl">{numberValue(counts[state])}</div></div>)}</div>
    {snapshot.active_run ? <div><h2 className="text-xl">Active run</h2><RecordDetails value={presentRun(objectValue(snapshot.active_run))} /></div> : null}
  </section>;
}
