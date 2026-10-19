import { Badge } from '@/shared/components/ui/badge';
import LoadingState from '@/shared/components/loading-state';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/shared/components/ui/card';
import { repairKeys, recoveryQueueQuery } from '../repair.queries';
import { request } from '../../../shared/api/client';
import { objectValue, numberValue, stringValue } from '../../../shared/api/json-response';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../shared/components/action-message';

export default function RecoveryQueue() {
  const queue = useQuery(recoveryQueueQuery());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  if (queue.isPending) return <LoadingState label="Loading recovery queue…" />;
  if (queue.isError && !queue.data) return <p role="alert">{queue.error.message}</p>;
  const status = queue.data;
  const counts = objectValue(status.status_counts);
  const cooldowns = Object.entries(objectValue(status.search_cooldowns));
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">Recovery queue</h2>
        </CardTitle>
        <CardAction>
          {' '}
          <Button
            disabled={action.isPending}
            onClick={() =>
              action.mutate(async () => {
                await request('api/arr/reacquire/queue', {
                  method: 'POST',
                  json: { paused: !status.paused },
                });
                return status.paused ? 'Recovery queue resumed.' : 'Recovery queue paused.';
              })
            }
            variant="secondary"
            size="sm"
          >
            {status.paused ? 'Resume new recoveries' : 'Pause new recoveries'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2">
        {queue.isError ? (
          <p role="alert">{queue.error.message} Showing the last received data.</p>
        ) : null}
        <p>
          {status.paused ? 'New recoveries paused.' : 'Recovery queue active.'}{' '}
          {numberValue(status.in_flight)}/{numberValue(status.max_active)} active slots.{' '}
          {numberValue(status.queued)} queued. {numberValue(status.searching)}/
          {numberValue(status.search_workers)} search workers.
        </p>
        {status.next_allowed_at ? <p>Next start: {stringValue(status.next_allowed_at)}</p> : null}
        {cooldowns.length > 0 ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Search cooldowns ({cooldowns.length})</summary>
            {cooldowns.map(([name, until]) => (
              <p key={name} className="mt-1">
                {name} until {stringValue(until)}
              </p>
            ))}
          </details>
        ) : null}
        {status.error ? <p role="alert">{stringValue(status.error)}</p> : null}
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts).map(([name, count]) => (
            <Badge key={name} variant="secondary">
              {name.replaceAll('_', ' ')} <span className="tabular-nums">{numberValue(count)}</span>
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground">
            {numberValue(counts.ready)} of {numberValue(status.total)} retained jobs imported.
          </span>
        </div>

        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
