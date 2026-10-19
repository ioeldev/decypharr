import { Checkbox } from '@/shared/components/ui/checkbox';
import { TableCell, TableRow } from '@/shared/components/ui/table';
import { Progress } from '@/shared/components/ui/progress';
import RowActions from '@/shared/components/row-actions';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/components/ui/dropdown-menu';
import type { QueueEntry } from '../../../queues.types';

interface QueueRowProps {
  entry: QueueEntry;
  isSelected: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onDelete: (removeFromProvider: boolean) => void;
  onCopy: (text: string) => void;
}

export default function QueueRow({
  entry,
  isSelected,
  isBusy,
  onSelect,
  onDelete,
  onCopy,
}: QueueRowProps) {
  const progressPercent = Math.round((entry.progress ?? 0) * 100);
  const speedBytesPerSecond = entry.speed ?? entry.dlspeed ?? 0;
  return (
    <TableRow>
      <TableCell>
        <Checkbox
          aria-label={`Select ${entry.name}`}
          checked={isSelected}
          onCheckedChange={onSelect}
        />
      </TableCell>
      <TableCell>
        <div className="max-w-48 truncate font-medium sm:max-w-80" title={entry.name}>
          {entry.name}
        </div>
        <small>{entry.info_hash.slice(0, 8)}…</small>
      </TableCell>
      <TableCell>{formatBytes(entry.size ?? 0)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Progress value={progressPercent} className="w-16" />
          <span className="text-xs tabular-nums">{progressPercent}%</span>
        </div>
      </TableCell>
      <TableCell>
        {speedBytesPerSecond > 0 ? `${formatBytes(speedBytesPerSecond)}/s` : '—'}
      </TableCell>
      <TableCell>{entry.category || '—'}</TableCell>
      <TableCell>{entry.protocol === 'nzb' ? 'Usenet' : entry.protocol || 'Unknown'}</TableCell>
      <TableCell>{entry.active_provider || '—'}</TableCell>
      <TableCell>{entry.num_seeds ?? 0}</TableCell>
      <TableCell>{entry.state === 'pausedUP' ? 'Completed' : entry.state || 'Unknown'}</TableCell>
      <TableCell>
        <RowActions label={entry.name} disabled={isBusy}>
          <DropdownMenuItem onSelect={() => onCopy(entry.name)}>Copy Name</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCopy(`magnet:?xt=urn:btih:${entry.info_hash}`)}>
            Copy Magnet
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(false)}>
            Delete
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(true)}>
            Remove From Provider
          </DropdownMenuItem>
        </RowActions>
      </TableCell>
    </TableRow>
  );
}
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** unitIndex).toFixed(2))} ${units[unitIndex]}`;
}
