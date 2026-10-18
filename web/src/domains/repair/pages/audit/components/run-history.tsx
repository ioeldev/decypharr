import { Empty, EmptyHeader, EmptyTitle } from '@/shared/components/ui/empty';
import LoadingState from '@/shared/components/loading-state';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { repairKeys, repairHistoryQuery } from '../../../repair.queries';
import { request } from '../../../../../shared/api/client';
import { stringValue } from '../../../../../shared/api/json-response';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../../shared/components/action-message';
import RecordDetails from '../../../../../shared/components/record-details';
import { presentRun } from '../run-presentation';

export default function RunHistory() {
  const history = useQuery(repairHistoryQuery());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  if (history.isPending) return <LoadingState label="Loading run history…" />;
  if (history.isError && !history.data) return <p role="alert">{history.error.message}</p>;
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl">Run History</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {history.isError ? (
          <p role="alert">{history.error.message} Showing the last received data.</p>
        ) : null}
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => void history.refetch()} variant="secondary" size="sm">
            Refresh
          </Button>
          <Button
            disabled={action.isPending}
            onClick={() => {
              if (!confirm('Clear all run history?')) return;
              action.mutate(async () => {
                await request('api/repair/runs', { method: 'DELETE' });
                return 'History cleared.';
              });
            }}
            variant="secondary"
            size="sm"
          >
            Clear History
          </Button>
        </div>
        {history.data.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No runs yet.</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          history.data.map(presentRun).map((run, index) => (
            <details
              key={stringValue(run.id) || index}
              className="rounded-xl border bg-card bg-muted/50"
            >
              <summary className="cursor-pointer p-4 font-medium">
                {stringValue(run.started_at)} · {stringValue(run.status)} ·{' '}
                {stringValue(run.source)}
              </summary>
              <div className="px-4 pb-4">
                <RecordDetails value={run} />
              </div>
            </details>
          ))
        )}
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
