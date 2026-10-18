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
  if (queue.isPending) return <p>Loading recovery queue…</p>;
  if (queue.isError && !queue.data) return <p role="alert">{queue.error.message}</p>;

  const status = queue.data;
  const counts = objectValue(status.status_counts);
  return <section className="card bg-base-100 p-5 space-y-3">
    {queue.isError ? <p role="alert">{queue.error.message} Showing the last received data.</p> : null}
    <h2 className="text-xl">Recovery queue</h2>
    <p>{status.paused ? 'New recoveries paused.' : 'Recovery queue active.'} {numberValue(status.in_flight)}/{numberValue(status.max_active)} active slots. {numberValue(status.queued)} queued. {numberValue(status.searching)}/{numberValue(status.search_workers)} search workers.</p>
    {status.next_allowed_at ? <p>Next start: {stringValue(status.next_allowed_at)}</p> : null}
    {Object.entries(objectValue(status.search_cooldowns)).map(([name, until]) => <p key={name}>Search rate limit: {name} until {stringValue(until)}</p>)}
    {status.error ? <p role="alert">{stringValue(status.error)}</p> : null}
    <div className="flex flex-wrap gap-3">{Object.entries(counts).map(([name, count]) => <div key={name} className="stat bg-base-200 w-auto"><div className="stat-title">{name.replaceAll('_', ' ')}</div><div className="stat-value text-xl">{numberValue(count)}</div></div>)}</div>
    <p>{numberValue(counts.ready)} of {numberValue(status.total)} retained jobs imported.</p>
    <button className="btn btn-sm w-fit" disabled={action.isPending} onClick={() => action.mutate(async () => {
      await request('api/arr/reacquire/queue', { method: 'POST', json: { paused: !status.paused } });
      return status.paused ? 'Recovery queue resumed.' : 'Recovery queue paused.';
    })}>{status.paused ? 'Resume new recoveries' : 'Pause new recoveries'}</button>
    <ActionMessage state={action} />
  </section>;
}
