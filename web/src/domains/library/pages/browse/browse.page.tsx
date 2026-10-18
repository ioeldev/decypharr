import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { request } from '../../../../shared/api/client';
import { useApiResource } from '../../../../shared/hooks/use-api-resource';
import { useAction } from '../../../../shared/hooks/use-action';
import ActionMessage from '../../../../shared/components/action-message';
import Pagination from '../../../../shared/components/pagination';
import { browseSchema, downloadUrl, type BrowseEntry } from '../../library.api';
import EntryHealth from './components/entry-health';

export default function BrowsePage() {
  const [parameters, setParameters] = useSearchParams();
  const [selected, setSelected] = useState(new Map<string, BrowseEntry>());
  const path = parameters.get('path') ?? '/';
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const query = new URLSearchParams(parameters);
  query.delete('path');
  const directory = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const listing = useApiResource({ path: `api/browse/${directory}?${query}`, parse: browseSchema.parse });
  const action = useAction();

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

    action.run(async () => {
      await request('api/browse/torrents/batch', { method: 'DELETE', json: { ids } });
      setSelected(new Map());
      listing.reload();
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
      <button className="btn btn-sm" onClick={() => listing.reload()}>Refresh</button>
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
    <ActionMessage state={action.state} />
    {listing.state.kind === 'loading' ? <p role="status">Loading directory…</p> : null}
    {listing.state.kind === 'error' ? <p role="alert">{listing.state.message}</p> : null}
    {listing.state.kind === 'ready' ? <>
      {listing.state.value.current_kind === 'virtual' ? <p className="alert">This is a virtual folder. Deleting an item removes the original from all views. <Link to="/settings?tab=virtual_folders">Edit virtual folders</Link></p> : null}
      {listing.state.value.entries.length === 0 ? <p>No files or folders found here.</p> : <div className="overflow-x-auto bg-base-100 rounded-box">
        <table className="table"><thead><tr>
          <th><input type="checkbox" className="checkbox" aria-label="Select all visible entries" checked={listing.state.value.entries.length > 0 && listing.state.value.entries.every((entry) => selected.has(entry.path))} onChange={(event) => {
            if (listing.state.kind !== 'ready') return;
            setSelected(event.target.checked ? new Map(listing.state.value.entries.map((entry) => [entry.path, entry])) : new Map());
          }} /></th>
          <th>Name</th><th>Size</th><th>Modified</th><th>Provider</th><th>Health</th><th>Actions</th>
        </tr></thead><tbody>{listing.state.value.entries.map((entry) => <tr key={entry.path}>
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
      <p>{listing.state.value.total} entries</p>
      <Pagination page={page} totalPages={listing.state.value.total_pages} onChange={(next) => changeParameter('page', String(next))} />
    </> : null}
  </section>;
}
