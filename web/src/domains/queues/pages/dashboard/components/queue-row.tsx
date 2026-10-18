import type { QueueEntry } from '../../../queues.types';

interface QueueRowProps {
  entry: QueueEntry;
  isSelected: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onDelete: (removeFromProvider: boolean) => void;
  onCopy: (text: string) => void;
}

export default function QueueRow({ entry, isSelected, isBusy, onSelect, onDelete, onCopy }: QueueRowProps) {
  const progressPercent = Math.round((entry.progress ?? 0) * 100);
  const speedBytesPerSecond = entry.speed ?? entry.dlspeed ?? 0;

  return (
    <tr>
      <td><input type="checkbox" className="checkbox checkbox-sm" aria-label={`Select ${entry.name}`}
        checked={isSelected} onChange={onSelect} /></td>
      <td><div className="font-medium">{entry.name}</div><small>{entry.info_hash.slice(0, 8)}…</small></td>
      <td>{formatBytes(entry.size ?? 0)}</td>
      <td><progress className="progress progress-primary w-20" value={progressPercent} max="100" /> {progressPercent}%</td>
      <td>{speedBytesPerSecond > 0 ? `${formatBytes(speedBytesPerSecond)}/s` : '—'}</td>
      <td>{entry.category || '—'}</td>
      <td>{entry.protocol === 'nzb' ? 'Usenet' : entry.protocol || 'Unknown'}</td>
      <td>{entry.active_provider || '—'}</td>
      <td>{entry.num_seeds ?? 0}</td>
      <td>{entry.state === 'pausedUP' ? 'Completed' : entry.state || 'Unknown'}</td>
      <td>
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-xs" disabled={isBusy} onClick={() => onCopy(entry.name)}>Copy Name</button>
          <button className="btn btn-ghost btn-xs" disabled={isBusy}
            onClick={() => onCopy(`magnet:?xt=urn:btih:${entry.info_hash}`)}>Copy Magnet</button>
          <button className="btn btn-ghost btn-xs text-error" disabled={isBusy} onClick={() => onDelete(false)}>Delete</button>
          <button className="btn btn-ghost btn-xs text-error" disabled={isBusy} onClick={() => onDelete(true)}>Remove From Provider</button>
        </div>
      </td>
    </tr>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  return `${Number((bytes / 1024 ** unitIndex).toFixed(2))} ${units[unitIndex]}`;
}
