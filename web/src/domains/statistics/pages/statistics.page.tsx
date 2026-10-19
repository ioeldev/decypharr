import PageHeader from '@/shared/components/page-header';
import LoadingState from '@/shared/components/loading-state';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { statisticsQuery } from '../statistics.queries';
import { arrayValue, objectValue, stringValue } from '../../../shared/api/json-response';
import { useQuery } from '@tanstack/react-query';
import RecordDetails from '../../../shared/components/record-details';
import ProviderSpeedTest from './components/provider-speed-test';
import CacheActions from './components/cache-actions';
import AccessInstructions from './components/access-instructions';

export default function StatisticsPage() {
  const stats = useQuery(statisticsQuery());
  if (stats.isPending) return <LoadingState label="Loading statistics…" />;
  if (stats.isError && !stats.data)
    return (
      <section>
        <p role="alert">{stats.error.message}</p>
        <Button onClick={() => void stats.refetch()} variant="secondary">
          Retry
        </Button>
      </section>
    );
  const snapshot = stats.data;
  return (
    <div className="flex flex-col gap-5">
      {stats.isError ? (
        <p role="alert">{stats.error.message} Showing the last received data.</p>
      ) : null}
      <div className="flex justify-between flex-wrap">
        <PageHeader
          title="Statistics"
          description="Inspect your providers, cache, and instance activity."
        />
        <Button onClick={() => void stats.refetch()} variant="secondary" size="sm">
          Refresh
        </Button>
      </div>
      {Object.entries(snapshot).map(([name, value]) => (
        <Card key={name} className="flex flex-col gap-4">
          <CardHeader>
            <CardTitle>
              <h2 className="text-xl capitalize">{name.replaceAll('_', ' ')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-4">
            <RecordDetails value={value} />
            {name === 'mount' && objectValue(value).type === 'dfs' ? <CacheActions /> : null}
            {name === 'access' ? <AccessInstructions access={objectValue(value)} /> : null}
            {name === 'debrids'
              ? arrayValue(value)
                  .map(objectValue)
                  .map((provider, index) => (
                    <ProviderSpeedTest
                      key={index}
                      protocol="debrid"
                      provider={stringValue(objectValue(provider.profile).name)}
                    />
                  ))
              : null}
            {name === 'usenet'
              ? arrayValue(objectValue(value).providers)
                  .map(objectValue)
                  .map((provider, index) => (
                    <ProviderSpeedTest
                      key={index}
                      protocol="nntp"
                      provider={stringValue(provider.id) || stringValue(provider.host)}
                    />
                  ))
              : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
