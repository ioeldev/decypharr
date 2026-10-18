import PageHeader from '@/shared/components/page-header';
import LoadingState from '@/shared/components/loading-state';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { ApiError } from '../../../../shared/api/client';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { QueueFilters as Filters } from '../../queues.types';
import QueueFilters from './components/queue-filters';
import QueueTable from './components/queue-table';
import { useQueue } from './hooks/use-queue';
import { useQueueActions } from './hooks/use-queue-actions';

export default function DashboardPage() {
  const [filters, setFilters] = useState<Filters>({
    page: 1,
    search: '',
    category: '',
    state: '',
    sort: 'added_on:desc',
  });
  const [selectedHashes, setSelectedHashes] = useState(new Set<string>());
  const queue = useQueue(filters);
  const actions = useQueueActions((deletedHashes) => {
    setSelectedHashes(
      (previous) => new Set([...previous].filter((hash) => !deletedHashes.includes(hash))),
    );
  });
  function toggleSelection(hash: string): void {
    setSelectedHashes((previous) => {
      const next = new Set(previous);
      if (next.has(hash)) {
        next.delete(hash);
        return next;
      }
      next.add(hash);
      return next;
    });
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Queues"
        description="Monitor downloads across your connected providers."
        actions={
          <Button asChild>
            <Link to="/download">Add download</Link>
          </Button>
        }
      />
      <Card className="shadow-sm  flex flex-col gap-4">
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => void queue.refetch()} variant="outline" size="sm">
              Refresh
            </Button>
            {selectedHashes.size > 0 ? (
              <>
                <Button
                  disabled={actions.action.isPending}
                  onClick={() => actions.deleteEntries([...selectedHashes], false)}
                  variant="secondary"
                  size="sm"
                >
                  Delete Selected ({selectedHashes.size})
                </Button>
                <Button
                  disabled={actions.action.isPending}
                  onClick={() => actions.deleteEntries([...selectedHashes], true)}
                  variant="destructive"
                  size="sm"
                >
                  Remove From Provider
                </Button>
              </>
            ) : null}
          </div>
          <QueueFilters
            filters={filters}
            categories={
              queue.data !== undefined ? queue.data.categories : [filters.category].filter(Boolean)
            }
            onChange={setFilters}
          />
        </CardContent>
      </Card>
      {actions.action.isError ? (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{actions.action.error?.message}</AlertDescription>
        </Alert>
      ) : null}
      {actions.action.isSuccess ? (
        <Alert role="status" variant="default">
          <AlertDescription>{actions.action.data}</AlertDescription>
        </Alert>
      ) : null}
      {queue.isPending ? <LoadingState label="Loading queues…" /> : null}
      {queue.isError ? (
        <Alert role="alert" variant="destructive">
          <AlertDescription>
            <span>{queue.error.message}</span>
            {queue.error instanceof ApiError && queue.error.status === 401 ? (
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                Log in
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {queue.data !== undefined ? (
        <QueueTable
          queue={queue.data}
          selectedHashes={selectedHashes}
          page={filters.page}
          isBusy={actions.action.isPending}
          onSelect={toggleSelection}
          onDelete={actions.deleteEntries}
          onCopy={actions.copyText}
          onSelectAll={(isSelected) => {
            if (queue.data === undefined) return;
            setSelectedHashes(
              isSelected ? new Set(queue.data.torrents.map((entry) => entry.info_hash)) : new Set(),
            );
          }}
          onPageChange={(page) => setFilters({ ...filters, page })}
        />
      ) : null}
    </div>
  );
}
