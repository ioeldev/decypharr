import { request } from '../../../shared/api/client';
import { jsonObjectSchema, objectValue, numberValue, stringValue } from '../../../shared/api/json-response';
import { useApiResource } from '../../../shared/hooks/use-api-resource';
import { useAction } from '../../../shared/hooks/use-action';
import ActionMessage from '../../../shared/components/action-message';

export default function RecoveryQueue() {
  const queue = useApiResource({ path: 'api/arr/reacquire/queue', parse: jsonObjectSchema.parse, pollIntervalMs: 5000 });
  const action = useAction();
  if (queue.state.kind === 'loading') return <p>Loading recovery queue…</p>;
  if (queue.state.kind === 'error') return <p role="alert">{queue.state.message}</p>;

  const status = queue.state.value;
  const counts = objectValue(status.status_counts);
  return <section className="card bg-base-100 p-5 space-y-3">
    <h2 className="text-xl">Recovery queue</h2>
    <p>{status.paused ? 'New recoveries paused.' : 'Recovery queue active.'} {numberValue(status.in_flight)}/{numberValue(status.max_active)} active slots. {numberValue(status.queued)} queued. {numberValue(status.searching)}/{numberValue(status.search_workers)} search workers.</p>
    {status.next_allowed_at ? <p>Next start: {stringValue(status.next_allowed_at)}</p> : null}
    {Object.entries(objectValue(status.search_cooldowns)).map(([name, until]) => <p key={name}>Search rate limit: {name} until {stringValue(until)}</p>)}
    {status.error ? <p role="alert">{stringValue(status.error)}</p> : null}
    <div className="flex flex-wrap gap-3">{Object.entries(counts).map(([name, count]) => <div key={name} className="stat bg-base-200 w-auto"><div className="stat-title">{name.replaceAll('_', ' ')}</div><div className="stat-value text-xl">{numberValue(count)}</div></div>)}</div>
    <p>{numberValue(counts.ready)} of {numberValue(status.total)} retained jobs imported.</p>
    <button className="btn btn-sm w-fit" disabled={action.isPending} onClick={() => action.run(async () => {
      await request('api/arr/reacquire/queue', { method: 'POST', json: { paused: !status.paused } });
      queue.reload();
      return status.paused ? 'Recovery queue resumed.' : 'Recovery queue paused.';
    })}>{status.paused ? 'Resume new recoveries' : 'Pause new recoveries'}</button>
    <ActionMessage state={action.state} />
  </section>;
}
