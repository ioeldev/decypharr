import { Link } from 'react-router-dom';
import type { QueuePage } from '../../../queues.types';
import QueueRow from './queue-row';

interface QueueTableProps {
  queue: QueuePage;
  selectedHashes: Set<string>;
  page: number;
  isBusy: boolean;
  onSelect: (hash: string) => void;
  onSelectAll: (isSelected: boolean) => void;
  onDelete: (hashes: string[], removeFromProvider: boolean) => void;
  onCopy: (text: string) => void;
  onPageChange: (page: number) => void;
}

export default function QueueTable(props: QueueTableProps) {
  const { queue, selectedHashes, page } = props;
  const areAllSelected = queue.torrents.every((entry) => selectedHashes.has(entry.info_hash));
  const firstItem = (page - 1) * 20 + 1;
  const lastItem = Math.min(page * 20, queue.total);

  if (queue.torrents.length === 0) {
    return <div className="card bg-base-100 p-8 space-y-4">
      <h2 className="text-xl">No Queues Found</h2>
      <p>Try another filter or add a download.</p>
      {page > 1 ? <button className="btn" onClick={() => props.onPageChange(page - 1)}>Previous page</button> : null}
      <Link className="link" to="/download">Add New Download</Link>
    </div>;
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr>
            <th><input type="checkbox" className="checkbox checkbox-sm" aria-label="Select all visible entries"
              checked={areAllSelected} onChange={(event) => props.onSelectAll(event.target.checked)} /></th>
            {['Name', 'Size', 'Progress', 'Speed', 'Category', 'Protocol', 'Provider', 'Seeders', 'State', 'Actions']
              .map((heading) => <th key={heading}>{heading}</th>)}
          </tr></thead>
          <tbody>{queue.torrents.map((entry) => <QueueRow key={entry.info_hash} entry={entry}
            isSelected={selectedHashes.has(entry.info_hash)} isBusy={props.isBusy}
            onSelect={() => props.onSelect(entry.info_hash)} onCopy={props.onCopy}
            onDelete={(removeFromProvider) => props.onDelete([entry.info_hash], removeFromProvider)} />)}</tbody>
        </table>
      </div>
      <div className="flex justify-between items-center p-4">
        <span>Showing {firstItem}–{lastItem} of {queue.total} items</span>
        <div className="join">
          <button className="btn btn-sm join-item" disabled={page <= 1} onClick={() => props.onPageChange(page - 1)}>Previous</button>
          <span className="btn btn-sm join-item">{page} / {queue.total_pages}</span>
          <button className="btn btn-sm join-item" disabled={page >= queue.total_pages} onClick={() => props.onPageChange(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
