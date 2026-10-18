import LoadingState from '@/shared/components/loading-state';
import { Card, CardContent } from '@/shared/components/ui/card';
import { repairStatusQuery } from '../../../repair.queries';
import { objectValue, numberValue, stringValue } from '../../../../../shared/api/json-response';
import { useQuery } from '@tanstack/react-query';
import RecordDetails from '../../../../../shared/components/record-details';
import { presentRun } from '../run-presentation';
import { healthStates } from '../../../repair.api';

export default function AuditStatus() {
  const status = useQuery(repairStatusQuery());
  if (status.isPending) return <LoadingState label="Loading health status…" />;
  if (status.isError && !status.data) return <p role="alert">{status.error.message}</p>;
  const snapshot = status.data;
  const counts = objectValue(snapshot.health_counts);
  return (
    <Card className="flex flex-col gap-4">
      <CardContent className="flex min-w-0 flex-col gap-4">
        {status.isError ? (
          <p role="alert">{status.error.message} Showing the last received data.</p>
        ) : null}
        <p>
          {snapshot.enabled
            ? `Repair enabled. Next run: ${stringValue(snapshot.next_run_at) || 'Not scheduled'}`
            : 'Scheduled repair is disabled. You can still run a one-off check.'}
        </p>
        <div className="flex gap-3 flex-wrap">
          {healthStates.map((state) => (
            <div key={state} className="rounded-lg border p-4 flex-1 min-w-32 bg-muted/50">
              <div className="text-sm text-muted-foreground">{state}</div>
              <div className="font-semibold tracking-tight tabular-nums text-xl">
                {numberValue(counts[state])}
              </div>
            </div>
          ))}
        </div>
        {snapshot.active_run ? (
          <div>
            <h2 className="text-xl">Active run</h2>
            <RecordDetails value={presentRun(objectValue(snapshot.active_run))} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
