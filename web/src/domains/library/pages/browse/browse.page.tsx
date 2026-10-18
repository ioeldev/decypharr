import PageHeader from '@/shared/components/page-header';
import { Empty, EmptyHeader, EmptyTitle } from '@/shared/components/ui/empty';
import LoadingState from '@/shared/components/loading-state';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { NativeSelectOption, NativeSelect } from '@/shared/components/ui/native-select';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import {
  TableHead,
  TableRow,
  TableHeader,
  TableCell,
  TableBody,
  Table,
} from '@/shared/components/ui/table';
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
    onSettled: () =>
      Promise.all([
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
    const ids = entries
      .filter((entry) => entry.can_delete && entry.info_hash)
      .map((entry) => entry.info_hash);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Permanently delete ${ids.length} original item(s) from every library, virtual folder, and provider?`,
      )
    )
      return;
    action.mutate(async () => {
      await request('api/browse/torrents/batch', { method: 'DELETE', json: { ids } });
      setSelected(new Map());
      return 'Items deleted.';
    });
  }
  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title="Browse Library"
        description="Explore your media library and virtual folders."
      />
      <nav aria-label="Library location" className="text-sm text-muted-foreground">
        <ul>
          <li>
            <Button onClick={() => changeParameter('path', '/')} variant="secondary">
              Library
            </Button>
          </li>
          {path
            .split('/')
            .filter(Boolean)
            .map((part, index, parts) => (
              <li key={index}>
                <Button
                  onClick={() => changeParameter('path', '/' + parts.slice(0, index + 1).join('/'))}
                  variant="secondary"
                >
                  {part}
                </Button>
              </li>
            ))}
        </ul>
      </nav>
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => void listing.refetch()} variant="secondary" size="sm">
          Refresh
        </Button>
        <Input
          aria-label="Search files"
          placeholder="Search"
          value={parameters.get('search') ?? ''}
          onChange={(event) => changeParameter('search', event.target.value)}
        />
        <NativeSelect
          aria-label="Page size"
          value={parameters.get('limit') ?? '20'}
          onChange={(event) => changeParameter('limit', event.target.value)}
        >
          {[20, 50, 100].map((limit) => (
            <NativeSelectOption key={limit}>{limit}</NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Sort files"
          value={parameters.get('sort_by') ?? 'name'}
          onChange={(event) => changeParameter('sort_by', event.target.value)}
        >
          <NativeSelectOption value="name">Name</NativeSelectOption>
          <NativeSelectOption value="size">Size</NativeSelectOption>
          <NativeSelectOption value="mod_time">Modified</NativeSelectOption>
          <NativeSelectOption value="active_debrid">Provider</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Sort direction"
          value={parameters.get('sort_order') ?? 'asc'}
          onChange={(event) => changeParameter('sort_order', event.target.value)}
        >
          <NativeSelectOption value="asc">Ascending</NativeSelectOption>
          <NativeSelectOption value="desc">Descending</NativeSelectOption>
        </NativeSelect>
      </div>
      {selected.size > 0 ? (
        <div className="flex gap-2 items-center flex-wrap">
          <span>{selected.size} selected</span>
          <Button
            onClick={() => {
              for (const entry of selected.values()) {
                if (!entry.is_dir) window.open(downloadUrl(entry), '_blank', 'noopener');
              }
            }}
            variant="secondary"
            size="sm"
          >
            Download Files
          </Button>
          <Button
            disabled={action.isPending}
            onClick={() => deleteEntries([...selected.values()])}
            variant="destructive"
            size="sm"
          >
            Delete Selected
          </Button>
          <Button onClick={() => setSelected(new Map())} variant="secondary" size="sm">
            Clear Selection
          </Button>
        </div>
      ) : null}
      <ActionMessage state={action} />
      {listing.isPending ? <LoadingState label="Loading directory…" /> : null}
      {listing.isError && !listing.data ? <p role="alert">{listing.error.message}</p> : null}
      {listing.data !== undefined ? (
        <>
          {listing.data.current_kind === 'virtual' ? (
            <Alert variant="default">
              <AlertDescription>
                This is a virtual folder. Deleting an item removes the original from all views.{' '}
                <Link to="/settings?tab=virtual_folders">Edit virtual folders</Link>
              </AlertDescription>
            </Alert>
          ) : null}
          {listing.data.entries.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No files or folders found here.</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto bg-card rounded-xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        aria-label="Select all visible entries"
                        checked={
                          listing.data.entries.length > 0 &&
                          listing.data.entries.every((entry) => selected.has(entry.path))
                        }
                        onCheckedChange={(event) => {
                          if (listing.data === undefined) return;
                          setSelected(
                            event === true
                              ? new Map(listing.data.entries.map((entry) => [entry.path, entry]))
                              : new Map(),
                          );
                        }}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Modified</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listing.data.entries.map((entry) => (
                    <TableRow key={entry.path}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${entry.name}`}
                          checked={selected.has(entry.path)}
                          onCheckedChange={(event) => {
                            const next = new Map(selected);
                            if (event === true) next.set(entry.path, entry);
                            if (!(event === true)) next.delete(entry.path);
                            setSelected(next);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {entry.is_dir ? (
                          <Button
                            onClick={() => changeParameter('path', entry.path)}
                            variant="secondary"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            📁 {entry.name}
                          </Button>
                        ) : (
                          <a
                            href={downloadUrl(entry)}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {entry.name}
                          </a>
                        )}
                      </TableCell>
                      <TableCell>{(entry.size / 1024 / 1024).toFixed(2)} MB</TableCell>
                      <TableCell>{entry.mod_time}</TableCell>
                      <TableCell>{entry.active_debrid || '—'}</TableCell>
                      <TableCell>
                        {entry.kind === 'entry' ? <EntryHealth name={entry.name} /> : '—'}
                      </TableCell>
                      <TableCell>
                        {entry.can_delete ? (
                          <Button
                            disabled={action.isPending}
                            onClick={() => deleteEntries([entry])}
                            variant="destructive"
                            size="sm"
                          >
                            Delete
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p>{listing.data.total} entries</p>
          <Pagination
            page={page}
            totalPages={listing.data.total_pages}
            onChange={(next) => changeParameter('page', String(next))}
          />
        </>
      ) : null}
    </section>
  );
}
