import { libraryFindingsQuery } from '../../repair.queries';
import { readPreference, savePreference } from '../../../../shared/browser/preferences';
import { useEffect, useState } from 'react';
import { stringValue } from '../../../../shared/api/json-response';
import { useQuery } from '@tanstack/react-query';
import Pagination from '../../../../shared/components/pagination';
import RepairNavigation from '../../components/repair-navigation';
import RecoveryQueue from '../../components/recovery-queue';
import { findingGroup, seriesLabel, type LibraryFinding as Finding } from './library-findings';
import LibraryFinding from './components/library-finding';

export default function LibraryPage() {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const sortKey = `decypharr.libraryRepair.sort:${new URL(document.baseURI).pathname}`;
  const [sort, setSort] = useState(() => {
    const saved = readPreference(sortKey);
    return saved && ['changed', 'checked', 'name', 'retry'].includes(saved) ? saved : 'changed';
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (search === query) return;

    const timer = setTimeout(() => { setSearch(query); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);
  const snapshot = useQuery(libraryFindingsQuery({ page, search, status: filter, sort }));
  const groups = new Map<string, Finding[]>();
  for (const finding of snapshot.data?.findings ?? []) {
    const key = findingGroup(finding);
    const group = groups.get(key);
    if (group) group.push(finding);
    else groups.set(key, [finding]);
  }
  const totalPages = Math.max(1, Math.ceil((snapshot.data?.total ?? 0) / (snapshot.data?.limit ?? 50)));
  const currentPage = snapshot.data?.page ?? page;

  return <div className="space-y-5"><h1 className="text-2xl font-bold">Library Findings</h1><RepairNavigation /><RecoveryQueue />
    <div className="flex gap-3"><button className="btn btn-sm" onClick={() => void snapshot.refetch()}>Refresh</button>
      <input aria-label="Search findings" className="input input-sm" value={query} onChange={(event) => { setQuery(event.target.value); }} placeholder="Search findings" />
      <select aria-label="Finding status" className="select select-sm" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>{['all', 'pending', 'active', 'attention', 'resolved'].map((category) => <option key={category}>{category}</option>)}</select>
      <select aria-label="Sort findings" className="select select-sm" value={sort} onChange={(event) => { setSort(event.target.value); savePreference(sortKey, event.target.value); setPage(1); }}>{['changed', 'checked', 'name', 'retry'].map((name) => <option key={name}>{name}</option>)}</select>
    </div>
    {snapshot.data !== undefined && snapshot.error?.message ? <p role="alert">{snapshot.error?.message}</p> : null}
    {snapshot.isPending ? <p>Loading findings…</p> : null}
    {(snapshot.isError && !snapshot.data) ? <p role="alert">{snapshot.error.message}</p> : null}
    {[...groups].map(([key, group]) => {
      const first = group[0];
      if (!first) return null;
      const rows = group.map((finding, index) => <LibraryFinding key={stringValue(finding.health?.entry_name) || `${stringValue(finding.job?.id)}-${index}`} finding={finding} maxRetries={snapshot.data?.maxRetries ?? 3} />);
      if (first.file.arr_kind !== 'sonarr') return <div key={key} className="card bg-base-100">{rows}</div>;
      return <details key={key} className="collapse collapse-arrow bg-base-100"><summary className="collapse-title">{seriesLabel(first)} · Season {first.season ?? 'unknown'} · {group.length} findings on this page</summary><div className="collapse-content">{rows}</div></details>;
    })}
    <p>{snapshot.data?.total ?? 0} findings · up to 50 per page</p>
    <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
  </div>;
}
