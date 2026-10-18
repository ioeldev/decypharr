import PageHeader from '@/shared/components/page-header';
import LoadingState from '@/shared/components/loading-state';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { NativeSelectOption, NativeSelect } from '@/shared/components/ui/native-select';
import { Card, CardContent } from '@/shared/components/ui/card';
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
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
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
  const totalPages = Math.max(
    1,
    Math.ceil((snapshot.data?.total ?? 0) / (snapshot.data?.limit ?? 50)),
  );
  const currentPage = snapshot.data?.page ?? page;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Library Findings"
        description="Review issues across your library and follow their recovery."
      />
      <RepairNavigation />
      <RecoveryQueue />
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => void snapshot.refetch()} variant="secondary" size="sm">
          Refresh
        </Button>
        <Input
          aria-label="Search findings"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search findings"
        />
        <NativeSelect
          aria-label="Finding status"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(1);
          }}
        >
          {['all', 'pending', 'active', 'attention', 'resolved'].map((category) => (
            <NativeSelectOption key={category}>{category}</NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Sort findings"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            savePreference(sortKey, event.target.value);
            setPage(1);
          }}
        >
          {['changed', 'checked', 'name', 'retry'].map((name) => (
            <NativeSelectOption key={name}>{name}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {snapshot.data !== undefined && snapshot.error?.message ? (
        <p role="alert">{snapshot.error?.message}</p>
      ) : null}
      {snapshot.isPending ? <LoadingState label="Loading findings…" /> : null}
      {snapshot.isError && !snapshot.data ? <p role="alert">{snapshot.error.message}</p> : null}
      {[...groups].map(([key, group]) => {
        const first = group[0];
        if (!first) return null;
        const rows = group.map((finding, index) => (
          <LibraryFinding
            key={
              stringValue(finding.health?.entry_name) || `${stringValue(finding.job?.id)}-${index}`
            }
            finding={finding}
            maxRetries={snapshot.data?.maxRetries ?? 3}
          />
        ));
        if (first.file.arr_kind !== 'sonarr')
          return (
            <Card key={key} className="">
              <CardContent className="flex min-w-0 flex-col gap-4">{rows}</CardContent>
            </Card>
          );
        return (
          <details key={key} className="rounded-xl border bg-card">
            <summary className="cursor-pointer p-4 font-medium">
              {seriesLabel(first)} · Season {first.season ?? 'unknown'} · {group.length} findings on
              this page
            </summary>
            <div className="px-4 pb-4">{rows}</div>
          </details>
        );
      })}
      <p>{snapshot.data?.total ?? 0} findings · up to 50 per page</p>
      <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
