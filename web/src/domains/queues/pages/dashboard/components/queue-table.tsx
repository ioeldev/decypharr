import { Download } from 'lucide-react';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@/shared/components/ui/empty';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { TableHead, TableRow, TableHeader, TableBody, Table } from '@/shared/components/ui/table';
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
    return (
      <Card>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Download />
            </EmptyMedia>
            <EmptyTitle>
              <h2>No Queues Found</h2>
            </EmptyTitle>
            <EmptyDescription>
              Try another filter or add a download to get started.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {page > 1 ? (
              <Button onClick={() => props.onPageChange(page - 1)} variant="secondary">
                Previous page
              </Button>
            ) : null}
            <Button asChild>
              <Link to="/download">Add New Download</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Download activity</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Checkbox
                    aria-label="Select all visible entries"
                    checked={areAllSelected}
                    onCheckedChange={(event) => props.onSelectAll(event === true)}
                  />
                </TableHead>
                {[
                  'Name',
                  'Size',
                  'Progress',
                  'Speed',
                  'Category',
                  'Protocol',
                  'Provider',
                  'Seeders',
                  'State',
                  'Actions',
                ].map((heading) => (
                  <TableHead key={heading}>{heading}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.torrents.map((entry) => (
                <QueueRow
                  key={entry.info_hash}
                  entry={entry}
                  isSelected={selectedHashes.has(entry.info_hash)}
                  isBusy={props.isBusy}
                  onSelect={() => props.onSelect(entry.info_hash)}
                  onCopy={props.onCopy}
                  onDelete={(removeFromProvider) =>
                    props.onDelete([entry.info_hash], removeFromProvider)
                  }
                />
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-between items-center p-4 flex-wrap">
          <span>
            Showing {firstItem}–{lastItem} of {queue.total} items
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={page <= 1}
              onClick={() => props.onPageChange(page - 1)}
              variant="secondary"
              size="sm"
            >
              Previous
            </Button>
            <span className="px-2 text-sm text-muted-foreground tabular-nums">
              {page} / {queue.total_pages}
            </span>
            <Button
              disabled={page >= queue.total_pages}
              onClick={() => props.onPageChange(page + 1)}
              variant="secondary"
              size="sm"
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
