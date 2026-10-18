import { statisticsQuery } from '../statistics.queries';
import { arrayValue, objectValue, stringValue } from '../../../shared/api/json-response';
import { useQuery } from '@tanstack/react-query';
import RecordDetails from '../../../shared/components/record-details';
import ProviderSpeedTest from './components/provider-speed-test';
import CacheActions from './components/cache-actions';
import AccessInstructions from './components/access-instructions';

export default function StatisticsPage() {
  const stats = useQuery(statisticsQuery());
  if (stats.isPending) return <p>Loading statistics…</p>;
  if (stats.isError && !stats.data) return <section><p role="alert">{stats.error.message}</p><button className="btn" onClick={() => void stats.refetch()}>Retry</button></section>;

  const snapshot = stats.data;
  return <div className="space-y-5">
    {stats.isError ? <p role="alert">{stats.error.message} Showing the last received data.</p> : null}
    <div className="flex justify-between"><h1 className="text-2xl font-bold">Statistics</h1><button className="btn btn-sm" onClick={() => void stats.refetch()}>Refresh</button></div>
    {Object.entries(snapshot).map(([name, value]) => <section className="card bg-base-100 p-5 space-y-4" key={name}>
      <h2 className="text-xl capitalize">{name.replaceAll('_', ' ')}</h2>
      <RecordDetails value={value} />
      {name === 'mount' && objectValue(value).type === 'dfs' ? <CacheActions /> : null}
      {name === 'access' ? <AccessInstructions access={objectValue(value)} /> : null}
      {name === 'debrids' ? arrayValue(value).map(objectValue).map((provider, index) => <ProviderSpeedTest key={index} protocol="debrid" provider={stringValue(objectValue(provider.profile).name)} />) : null}
      {name === 'usenet' ? arrayValue(objectValue(value).providers).map(objectValue).map((provider, index) => <ProviderSpeedTest key={index} protocol="nntp" provider={stringValue(provider.id) || stringValue(provider.host)} />) : null}
    </section>)}
  </div>;
}
