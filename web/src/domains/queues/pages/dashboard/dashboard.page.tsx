import { ApiError } from '../../../../shared/api/client';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { QueueFilters as Filters } from '../../queues.types';
import QueueFilters from './components/queue-filters';
import QueueTable from './components/queue-table';
import { useQueue } from './hooks/use-queue';
import { useQueueActions } from './hooks/use-queue-actions';

export default function DashboardPage() {
  const [filters, setFilters] = useState<Filters>({ page: 1, search: '', category: '', state: '', sort: 'added_on:desc' });
  const [selectedHashes, setSelectedHashes] = useState(new Set<string>());
  const queue = useQueue(filters);
  const actions = useQueueActions((deletedHashes) => {
    setSelectedHashes((previous) => new Set([...previous].filter((hash) => !deletedHashes.includes(hash))));
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Queues</h1>
      <div className="card bg-base-100 shadow-xl p-5 space-y-4">
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => void queue.refetch()}>Refresh</button>
          {selectedHashes.size > 0 ? <>
            <button className="btn btn-secondary btn-sm" disabled={actions.action.isPending}
              onClick={() => actions.deleteEntries([...selectedHashes], false)}>Delete Selected ({selectedHashes.size})</button>
            <button className="btn btn-error btn-sm" disabled={actions.action.isPending}
              onClick={() => actions.deleteEntries([...selectedHashes], true)}>Remove From Provider</button>
          </> : null}
        </div>
        <QueueFilters filters={filters} categories={queue.data !== undefined ? queue.data.categories : [filters.category].filter(Boolean)}
          onChange={setFilters} />
      </div>
      {actions.action.isError ? <p role="alert" className="alert alert-error">{actions.action.error?.message}</p> : null}
      {actions.action.isSuccess ? <p role="status" className="alert alert-success">{actions.action.data}</p> : null}
      {queue.isPending ? <p role="status">Loading queues…</p> : null}
      {queue.isError ? <div role="alert" className="alert alert-error">
        <span>{queue.error.message}</span>
        {queue.error instanceof ApiError && queue.error.status === 401 ? <Link to="/login" className="link">Log in</Link> : null}
      </div> : null}
      {queue.data !== undefined ? <QueueTable queue={queue.data} selectedHashes={selectedHashes}
        page={filters.page} isBusy={actions.action.isPending} onSelect={toggleSelection}
        onDelete={actions.deleteEntries} onCopy={actions.copyText}
        onSelectAll={(isSelected) => {
          if (queue.data === undefined) return;

          setSelectedHashes(isSelected ? new Set(queue.data.torrents.map((entry) => entry.info_hash)) : new Set());
        }}
        onPageChange={(page) => setFilters({ ...filters, page })} /> : null}
    </div>
  );
}
