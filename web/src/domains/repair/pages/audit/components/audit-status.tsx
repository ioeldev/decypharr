import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Square } from 'lucide-react';
import LoadingState from '@/shared/components/loading-state';
import ActionMessage from '@/shared/components/action-message';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/shared/components/ui/card';
import { objectValue, numberValue, stringValue } from '@/shared/api/json-response';
import { request } from '@/shared/api/client';
import { cn } from '@/shared/lib/classes';
import { repairKeys, repairStatusQuery } from '../../../repair.queries';
import RunHistoryRow from './run-history-row';
import { presentRun } from '../run-presentation';

const healthMetrics = [
  { status: 'healthy', label: 'Healthy', color: 'text-success-foreground' },
  { status: 'broken', label: 'Broken', color: 'text-destructive' },
  { status: 'repairing', label: 'Repairing', color: 'text-info-foreground' },
  { status: 'stale', label: 'Needs recheck', color: 'text-warning-foreground' },
  { status: 'unknown', label: 'Unchecked', color: 'text-muted-foreground' },
  { status: 'unsupported', label: 'Unsupported', color: 'text-muted-foreground' },
];

export default function AuditStatus() {
  const status = useQuery(repairStatusQuery());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: () => request('api/repair/stop', { method: 'POST' }).then(() => 'Stop requested.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });

  if (status.isPending) return <LoadingState label="Loading health status…" />;
  if (status.isError && !status.data) return <p role="alert">{status.error.message}</p>;

  const snapshot = status.data;
  const counts = objectValue(snapshot.health_counts);
  const nextRun = stringValue(snapshot.next_run_at);
  const nextRunMs = Date.parse(nextRun);
  const schedule = Number.isFinite(nextRunMs)
    ? new Date(nextRunMs).toLocaleString()
    : 'Not scheduled';

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Library health</h2>
        </CardTitle>
        <CardDescription>
          {snapshot.enabled
            ? `Next scheduled check: ${schedule}`
            : 'Scheduled checks are off. Run a health check whenever you need one.'}
        </CardDescription>
        {snapshot.active_run ? (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              disabled={action.isPending}
              onClick={() => action.mutate()}
            >
              <Square data-icon="inline-start" />
              Stop check
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {status.isError ? (
          <p role="alert">{status.error.message} Showing the last received data.</p>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {healthMetrics.map(({ status, label, color }) => (
            <div key={status} className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={cn('text-2xl font-semibold tabular-nums', color)}>
                {numberValue(counts[status])}
              </dd>
            </div>
          ))}
        </dl>
        {snapshot.active_run ? (
          <section
            aria-label="Active health check"
            className="rounded-lg border border-info-foreground/30 bg-info-foreground/5"
          >
            <RunHistoryRow run={presentRun(objectValue(snapshot.active_run))} />
          </section>
        ) : null}
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
