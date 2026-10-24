import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  LoaderCircle,
  Pause,
  Play,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/shared/components/ui/card';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Progress } from '@/shared/components/ui/progress';
import LoadingState from '@/shared/components/loading-state';
import ActionMessage from '@/shared/components/action-message';
import { request } from '@/shared/api/client';
import { objectValue, numberValue, stringValue } from '@/shared/api/json-response';
import { cn } from '@/shared/lib/classes';
import { repairKeys, recoveryQueueQuery } from '../repair.queries';
import { summarizeRecoveryQueue } from '../recovery-queue-presentation';

export default function RecoveryQueue() {
  const queue = useQuery(recoveryQueueQuery());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (isPaused: boolean) =>
      request('api/arr/reacquire/queue', {
        method: 'POST',
        json: { paused: isPaused },
      }).then(() =>
        isPaused ? 'New recoveries paused. Active recoveries continue.' : 'Recovery queue resumed.',
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });

  if (queue.isPending) return <LoadingState label="Loading recovery queue…" />;
  if (queue.isError && !queue.data) return <p role="alert">{queue.error.message}</p>;

  const status = queue.data;
  const summary = summarizeRecoveryQueue(status);
  const cooldowns = Object.entries(objectValue(status.search_cooldowns));
  let queueLabel = 'Idle';

  if (summary.queued > 0 || summary.retrying > 0) queueLabel = 'Waiting';
  if (summary.inFlight > 0) queueLabel = 'Recovering';
  if (status.paused) queueLabel = 'New starts paused';

  const activeVariant = summary.inFlight > 0 ? 'info' : 'secondary';
  const queueVariant = status.paused ? 'warning' : activeVariant;
  const stages = [
    { label: 'Queued', count: summary.queued, icon: Clock3, color: 'text-muted-foreground' },
    {
      label: 'Finding a replacement',
      count: summary.searching,
      icon: Search,
      color: 'text-primary',
    },
    {
      label: 'Downloading',
      count: summary.downloading,
      icon: Download,
      color: 'text-info-foreground',
    },
    {
      label: 'Awaiting import',
      count: summary.importing,
      icon: ArrowRight,
      color: 'text-info-foreground',
    },
    {
      label: 'Imported',
      count: summary.imported,
      icon: CheckCircle2,
      color: 'text-success-foreground',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Recovery queue</h2>
        </CardTitle>
        <CardDescription>
          {summary.inFlight > 0 ? `${summary.inFlight} recoveries in progress. ` : ''}
          {status.paused ? 'New starts are paused; active recoveries continue.' : summary.activity}
        </CardDescription>
        <CardAction className="col-start-1 row-start-3 flex flex-wrap items-center gap-2 justify-self-start pt-2 sm:col-start-2 sm:row-start-1 sm:justify-self-end sm:pt-0">
          <Badge variant={queueVariant}>
            {status.paused ? <Pause data-icon="inline-start" /> : null}
            {summary.inFlight > 0 ? (
              <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" />
            ) : null}
            {queueLabel}
          </Badge>
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate(!status.paused)}
            variant="outline"
            size="sm"
          >
            {status.paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
            {status.paused ? 'Resume' : 'Pause'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {queue.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {queue.error.message} Showing the last received data.
            </AlertDescription>
          </Alert>
        ) : null}
        {status.error ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{stringValue(status.error)}</AlertDescription>
          </Alert>
        ) : null}
        <dl aria-label="Recovery stages" className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {stages.map(({ label, count, icon: Icon, color }) => (
            <div
              key={label}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/30 p-3',
                count > 0 ? color : 'text-muted-foreground',
              )}
            >
              <dt className="flex items-center gap-2 text-xs">
                <Icon className="size-4 shrink-0" />
                {label}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
        {summary.total > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {summary.imported} of {summary.total} retained jobs imported
              </span>
              {summary.attention > 0 ? (
                <Badge variant="destructive">
                  <TriangleAlert data-icon="inline-start" />
                  {summary.attention} need attention
                </Badge>
              ) : null}
            </div>
            <Progress aria-label="Imported recovery jobs" value={summary.importedPercent} />
            <p className="text-xs text-muted-foreground">
              Imported replacements are checked separately for library health.
            </p>
          </div>
        ) : null}
        <details className="text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer">Queue limits and details</summary>
          <div className="mt-3 flex flex-col gap-2">
            <p>
              {summary.inFlight} / {numberValue(status.max_active)} active slots ·{' '}
              {numberValue(status.searching)} / {numberValue(status.search_workers)} search workers
            </p>
            <p>
              {numberValue(status.uncached_reserved)} / {numberValue(status.max_uncached_recoveries) || 1} uncached slots reserved ·{' '}
              {numberValue(status.uncached_waiting)} waiting ·{' '}
              {numberValue(status.uncached_cleanup_pending)} awaiting cleanup
            </p>
            {summary.nextStart ? <p>Next start allowed: {summary.nextStart}</p> : null}
            <p>
              {summary.retrying} awaiting retry · {summary.cancelled} cancelled
            </p>
            {cooldowns.map(([name, until]) => (
              <p key={name}>
                {name} search cooldown until {formatQueueTime(until)}
              </p>
            ))}
          </div>
        </details>
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}

function formatQueueTime(value: unknown): string {
  const time = Date.parse(typeof value === 'string' ? value : '');
  return Number.isFinite(time) ? new Date(time).toLocaleString() : 'Unknown';
}
