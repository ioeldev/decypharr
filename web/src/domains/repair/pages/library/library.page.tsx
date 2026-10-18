import { libraryFindingsQuery } from '../../repair.queries';
import { readPreference, savePreference } from '../../../../shared/browser/preferences';
import { useState } from 'react';
import { stringValue, numberValue } from '../../../../shared/api/json-response';
import { useQuery } from '@tanstack/react-query';
import Pagination from '../../../../shared/components/pagination';
import RepairNavigation from '../../components/repair-navigation';
import RecoveryQueue from '../../components/recovery-queue';
import { buildFindings, findingChangedAt, findingGroup, seriesLabel, type LibraryFinding as Finding } from './library-findings';
import LibraryFinding from './components/library-finding';

export default function LibraryPage() {
  const snapshot = useQuery(libraryFindingsQuery());
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const sortKey = `decypharr.libraryRepair.sort:${new URL(document.baseURI).pathname}`;
  const [sort, setSort] = useState(() => {
    const saved = readPreference(sortKey);
    return saved && ['changed', 'checked', 'name', 'retry'].includes(saved) ? saved : 'changed';
  });
  const [page, setPage] = useState(1);
  const findings = snapshot.data !== undefined ? buildFindings(snapshot.data) : [];
  const filtered = findings.filter((finding) => (filter === 'all' || finding.category === filter)
    && `${finding.label} ${stringValue(finding.file.arr_name)} ${stringValue(finding.file.source_path)} ${stringValue(finding.health?.failure_reason)} ${stringValue(finding.job?.lastError)}`.toLowerCase().includes(query.toLowerCase()));
  filtered.sort((first, second) => {
    if (sort === 'name') return first.label.localeCompare(second.label, undefined, { numeric: true });
    if (sort === 'checked') return Date.parse(stringValue(second.health?.last_checked_at) || '1970-01-01') - Date.parse(stringValue(first.health?.last_checked_at) || '1970-01-01');
    if (sort === 'retry') return Date.parse(stringValue(first.job?.retryAt) || '9999-01-01') - Date.parse(stringValue(second.job?.retryAt) || '9999-01-01');
    return findingChangedAt(second) - findingChangedAt(first);
  });
  const groups = new Map<string, Finding[]>();
  for (const finding of filtered) groups.set(findingGroup(finding), [...(groups.get(findingGroup(finding)) ?? []), finding]);
  const totalPages = Math.max(1, Math.ceil(groups.size / 25));
  const currentPage = Math.min(page, totalPages);

  return <div className="space-y-5"><h1 className="text-2xl font-bold">Library Findings</h1><RepairNavigation /><RecoveryQueue />
    <div className="flex gap-3"><button className="btn btn-sm" onClick={() => void snapshot.refetch()}>Refresh</button>
      <input aria-label="Search findings" className="input input-sm" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search findings" />
      <select aria-label="Finding status" className="select select-sm" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>{['all', 'pending', 'active', 'attention', 'resolved'].map((category) => <option key={category}>{category}</option>)}</select>
      <select aria-label="Sort findings" className="select select-sm" value={sort} onChange={(event) => { setSort(event.target.value); savePreference(sortKey, event.target.value); setPage(1); }}>{['changed', 'checked', 'name', 'retry'].map((name) => <option key={name}>{name}</option>)}</select>
    </div>
    {snapshot.data !== undefined && snapshot.error?.message ? <p role="alert">{snapshot.error?.message}</p> : null}
    {snapshot.isPending ? <p>Loading findings…</p> : null}
    {(snapshot.isError && !snapshot.data) ? <p role="alert">{snapshot.error.message}</p> : null}
    {[...groups].slice((currentPage - 1) * 25, currentPage * 25).map(([key, group]) => {
      const first = group[0];
      if (!first) return null;
      const rows = group.map((finding, index) => <LibraryFinding key={stringValue(finding.health?.entry_name) || `${stringValue(finding.job?.id)}-${index}`} finding={finding} maxRetries={snapshot.data !== undefined ? numberValue(snapshot.data.maxRetries) : 3} />);
      if (first.file.arr_kind !== 'sonarr') return <div key={key} className="card bg-base-100">{rows}</div>;
      return <details key={key} className="collapse collapse-arrow bg-base-100"><summary className="collapse-title">{seriesLabel(first)} · Season {first.season ?? 'unknown'} · {group.length} findings</summary><div className="collapse-content">{rows}</div></details>;
    })}
    <p>{filtered.length} findings · {groups.size} media/season groups</p>
    <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
  </div>;
}
