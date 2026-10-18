import { statisticsKeys } from '../../../statistics/statistics.queries';
import { queuesKeys } from '../../../queues/queues.queries';
import { libraryKeys, browseQuery } from '../../library.queries';
import { repairKeys } from '../../../repair/repair.queries';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { request } from '../../../../shared/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../shared/components/action-message';
import Pagination from '../../../../shared/components/pagination';
import { downloadUrl, type BrowseEntry } from '../../library.api';
import EntryHealth from './components/entry-health';

export default function BrowsePage() {
  const [parameters, setParameters] = useSearchParams();
  const [selected, setSelected] = useState(new Map<string, BrowseEntry>());
  const path = parameters.get('path') ?? '/';
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const query = new URLSearchParams(parameters);
  query.delete('path');
  const directory = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const listing = useQuery(browseQuery(directory, query.toString()));
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
      queryClient.invalidateQueries({ queryKey: queuesKeys.all }),
      queryClient.invalidateQueries({ queryKey: repairKeys.all }),
      queryClient.invalidateQueries({ queryKey: statisticsKeys.all }),
    ]),
  });

  function changeParameter(name: string, value: string): void {
    const next = new URLSearchParams(parameters);
    next.set(name, value);
    if (name !== 'page') next.set('page', '1');
    setParameters(next);
  }

  function deleteEntries(entries: BrowseEntry[]): void {
    const ids = entries.filter((entry) => entry.can_delete && entry.info_hash).map((entry) => entry.info_hash);
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} original item(s) from every library, virtual folder, and provider?`)) return;

    action.mutate(async () => {
      await request('api/browse/torrents/batch', { method: 'DELETE', json: { ids } });
      setSelected(new Map());
      return 'Items deleted.';
    });
  }

  return <section className="space-y-5">
    <h1 className="text-2xl font-bold">Browse Library</h1>
    <nav className="breadcrumbs" aria-label="Library location"><ul>
      <li><button onClick={() => changeParameter('path', '/')}>Library</button></li>
      {path.split('/').filter(Boolean).map((part, index, parts) => <li key={index}>
        <button onClick={() => changeParameter('path', '/' + parts.slice(0, index + 1).join('/'))}>{part}</button>
      </li>)}
    </ul></nav>
    <div className="flex gap-3">
      <button className="btn btn-sm" onClick={() => void listing.refetch()}>Refresh</button>
      <input className="input input-sm" aria-label="Search files" placeholder="Search" value={parameters.get('search') ?? ''} onChange={(event) => changeParameter('search', event.target.value)} />
      <select className="select select-sm" aria-label="Page size" value={parameters.get('limit') ?? '20'} onChange={(event) => changeParameter('limit', event.target.value)}>
        {[20, 50, 100].map((limit) => <option key={limit}>{limit}</option>)}
      </select>
      <select className="select select-sm" aria-label="Sort files" value={parameters.get('sort_by') ?? 'name'} onChange={(event) => changeParameter('sort_by', event.target.value)}>
        <option value="name">Name</option><option value="size">Size</option><option value="mod_time">Modified</option><option value="active_debrid">Provider</option>
      </select>
      <select className="select select-sm" aria-label="Sort direction" value={parameters.get('sort_order') ?? 'asc'} onChange={(event) => changeParameter('sort_order', event.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
    </div>
    {selected.size > 0 ? <div className="flex gap-2 items-center">
      <span>{selected.size} selected</span>
      <button className="btn btn-sm" onClick={() => { for (const entry of selected.values()) { if (!entry.is_dir) window.open(downloadUrl(entry), '_blank', 'noopener'); } }}>Download Files</button>
      <button className="btn btn-error btn-sm" disabled={action.isPending} onClick={() => deleteEntries([...selected.values()])}>Delete Selected</button>
      <button className="btn btn-sm" onClick={() => setSelected(new Map())}>Clear Selection</button>
    </div> : null}
    <ActionMessage state={action} />
    {listing.isPending ? <p role="status">Loading directory…</p> : null}
    {(listing.isError && !listing.data) ? <p role="alert">{listing.error.message}</p> : null}
    {listing.data !== undefined ? <>
      {listing.data.current_kind === 'virtual' ? <p className="alert">This is a virtual folder. Deleting an item removes the original from all views. <Link to="/settings?tab=virtual_folders">Edit virtual folders</Link></p> : null}
      {listing.data.entries.length === 0 ? <p>No files or folders found here.</p> : <div className="overflow-x-auto bg-base-100 rounded-box">
        <table className="table"><thead><tr>
          <th><input type="checkbox" className="checkbox" aria-label="Select all visible entries" checked={listing.data.entries.length > 0 && listing.data.entries.every((entry) => selected.has(entry.path))} onChange={(event) => {
            if (listing.data === undefined) return;
            setSelected(event.target.checked ? new Map(listing.data.entries.map((entry) => [entry.path, entry])) : new Map());
          }} /></th>
          <th>Name</th><th>Size</th><th>Modified</th><th>Provider</th><th>Health</th><th>Actions</th>
        </tr></thead><tbody>{listing.data.entries.map((entry) => <tr key={entry.path}>
          <td><input type="checkbox" className="checkbox" aria-label={`Select ${entry.name}`} checked={selected.has(entry.path)} onChange={(event) => {
            const next = new Map(selected);
            if (event.target.checked) next.set(entry.path, entry);
            if (!event.target.checked) next.delete(entry.path);
            setSelected(next);
          }} /></td>
          <td>{entry.is_dir ? <button className="link" onClick={() => changeParameter('path', entry.path)}>📁 {entry.name}</button> : <a className="link" href={downloadUrl(entry)}>{entry.name}</a>}</td>
          <td>{(entry.size / 1024 / 1024).toFixed(2)} MB</td><td>{entry.mod_time}</td><td>{entry.active_debrid || '—'}</td>
          <td>{entry.kind === 'entry' ? <EntryHealth name={entry.name} /> : '—'}</td>
          <td>{entry.can_delete ? <button className="btn btn-xs btn-error" disabled={action.isPending} onClick={() => deleteEntries([entry])}>Delete</button> : null}</td>
        </tr>)}</tbody></table>
      </div>}
      <p>{listing.data.total} entries</p>
      <Pagination page={page} totalPages={listing.data.total_pages} onChange={(next) => changeParameter('page', String(next))} />
    </> : null}
  </section>;
}
