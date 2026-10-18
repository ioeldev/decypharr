import LoadingState from '@/shared/components/loading-state';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
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
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl">Recovery queue</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
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
        {Object.entries(objectValue(status.search_cooldowns)).map(([name, until]) => (
          <p key={name}>
            Search rate limit: {name} until {stringValue(until)}
          </p>
        ))}
        {status.error ? <p role="alert">{stringValue(status.error)}</p> : null}
        <div className="flex flex-wrap gap-3">
          {Object.entries(counts).map(([name, count]) => (
            <div key={name} className="rounded-lg border p-4 flex-1 min-w-32 bg-muted/50 w-auto">
              <div className="text-sm text-muted-foreground">{name.replaceAll('_', ' ')}</div>
              <div className="font-semibold tracking-tight tabular-nums text-xl">
                {numberValue(count)}
              </div>
            </div>
          ))}
        </div>
        <p>
          {numberValue(counts.ready)} of {numberValue(status.total)} retained jobs imported.
        </p>
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
          className="w-fit"
        >
          {status.paused ? 'Resume new recoveries' : 'Pause new recoveries'}
        </Button>
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
