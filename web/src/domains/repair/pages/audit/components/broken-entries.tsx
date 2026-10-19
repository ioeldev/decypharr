import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Empty, EmptyHeader, EmptyTitle } from '@/shared/components/ui/empty';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from '@/shared/components/ui/card';
import LoadingState from '@/shared/components/loading-state';
import Pagination from '@/shared/components/pagination';
import { stringValue } from '@/shared/api/json-response';
import { brokenEntriesQuery } from '../../../repair.queries';
import BrokenEntry from './broken-entry';
import FixBrokenEntries from './fix-broken-entries';

export default function BrokenEntries() {
  const entries = useQuery(brokenEntriesQuery());
  const [page, setPage] = useState(1);

  if (entries.isPending) return <LoadingState label="Loading broken entries…" />;
  if (entries.isError && !entries.data) return <p role="alert">{entries.error.message}</p>;

  const totalPages = Math.max(1, Math.ceil(entries.data.length / 25));
  const currentPage = Math.min(page, totalPages);
  const visibleEntries = entries.data.slice((currentPage - 1) * 25, currentPage * 25);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Broken Entries ({entries.data.length})</h2>
        </CardTitle>
        <CardDescription>
          Entries that failed a health check and may need a replacement.
        </CardDescription>
        {entries.data.length > 0 ? (
          <CardAction className="col-start-1 row-start-3 justify-self-start pt-2 sm:col-start-2 sm:row-start-1 sm:justify-self-end sm:pt-0">
            <FixBrokenEntries />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        {entries.isError ? (
          <p role="alert">{entries.error.message} Showing the last received data.</p>
        ) : null}
        {entries.data.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No broken entries.</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-lg border">
            {visibleEntries.map((entry) => (
              <BrokenEntry key={stringValue(entry.entry_name)} entry={entry} />
            ))}
          </div>
        )}
        <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
      </CardContent>
    </Card>
  );
}
