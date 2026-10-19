import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/shared/components/ui/badge';
import { entryHealthQuery } from '../../../../repair/repair.queries';

export default function EntryHealth({ name }: { name: string }) {
  const health = useQuery(entryHealthQuery(name));

  return (
    <Badge
      title={health.data?.failure_reason}
      variant={health.data?.status === 'broken' ? 'destructive' : 'secondary'}
    >
      {health.data?.status ?? 'Unknown'}
    </Badge>
  );
}
