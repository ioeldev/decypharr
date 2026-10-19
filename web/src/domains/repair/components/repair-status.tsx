import { CheckCircle2, Clock3, LoaderCircle, Pause, TriangleAlert } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';

export default function RepairStatus({ status }: { status: string }) {
  if (['broken', 'failed', 'needs_attention', 'attention'].includes(status))
    return (
      <Badge variant="destructive">
        <TriangleAlert data-icon="inline-start" />
        {status.replaceAll('_', ' ')}
      </Badge>
    );

  if (['healthy', 'ready', 'resolved', 'completed', 'Submission complete'].includes(status))
    return (
      <Badge variant="success">
        <CheckCircle2 data-icon="inline-start" />
        {status === 'ready' ? 'Imported' : status}
      </Badge>
    );

  if (['suspended', 'retry_scheduled', 'stale'].includes(status))
    return (
      <Badge variant="warning">
        <Pause data-icon="inline-start" />
        {status.replaceAll('_', ' ')}
      </Badge>
    );

  if (
    [
      'running',
      'repairing',
      'resolving',
      'invalidating',
      'blocklisting',
      'searching',
      'waiting_for_grab',
      'waiting_for_download',
      'waiting_for_import',
    ].includes(status)
  )
    return (
      <Badge variant="info">
        <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" />
        {status.replaceAll('_', ' ')}
      </Badge>
    );

  return (
    <Badge variant="secondary">
      <Clock3 data-icon="inline-start" />
      {status.replaceAll('_', ' ') || 'pending'}
    </Badge>
  );
}
