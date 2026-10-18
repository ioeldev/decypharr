import { Checkbox } from '@/shared/components/ui/checkbox';
import { TableCell, TableRow } from '@/shared/components/ui/table';
import { Progress } from '@/shared/components/ui/progress';
import { Button } from '@/shared/components/ui/button';
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
        <div className="font-medium">{entry.name}</div>
        <small>{entry.info_hash.slice(0, 8)}…</small>
      </TableCell>
      <TableCell>{formatBytes(entry.size ?? 0)}</TableCell>
      <TableCell>
        <Progress value={progressPercent} className="w-20" /> {progressPercent}%
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
        <div className="flex gap-1 flex-wrap">
          <Button disabled={isBusy} onClick={() => onCopy(entry.name)} variant="ghost" size="sm">
            Copy Name
          </Button>
          <Button
            disabled={isBusy}
            onClick={() => onCopy(`magnet:?xt=urn:btih:${entry.info_hash}`)}
            variant="ghost"
            size="sm"
          >
            Copy Magnet
          </Button>
          <Button disabled={isBusy} onClick={() => onDelete(false)} variant="destructive" size="sm">
            Delete
          </Button>
          <Button disabled={isBusy} onClick={() => onDelete(true)} variant="destructive" size="sm">
            Remove From Provider
          </Button>
        </div>
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
