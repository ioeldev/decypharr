import { Badge } from '@/shared/components/ui/badge';

export default function RepairStatus({ status }: { status: string }) {
  const needsAttention = ['broken', 'failed', 'needs_attention', 'attention'].includes(status);
  const isComplete = ['healthy', 'ready', 'resolved', 'completed', 'Submission complete'].includes(
    status,
  );
  const neutralVariant = isComplete ? 'default' : 'secondary';
  const variant = needsAttention ? 'destructive' : neutralVariant;

  return <Badge variant={variant}>{status.replaceAll('_', ' ') || 'pending'}</Badge>;
}
