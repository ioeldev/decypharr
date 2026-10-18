import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { entryHealthQuery } from '../../../../repair/repair.queries';
import { request } from '../../../../../shared/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../../shared/components/action-message';

export default function EntryHealth({ name }: { name: string }) {
  const health = useQuery(entryHealthQuery(name));
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['repair', 'health'] }),
  });
  return (
    <div className="flex flex-col gap-1">
      <Badge
        title={health.data !== undefined ? health.data.failure_reason : undefined}
        variant="secondary"
      >
        {health.data !== undefined ? (health.data.status ?? 'Unknown') : 'Unknown'}
      </Badge>
      <Button
        disabled={action.isPending}
        onClick={() =>
          action.mutate(async () => {
            await request(`api/repair/health/${encodeURIComponent(name)}/check`, {
              method: 'POST',
            });
            return 'Recheck requested.';
          })
        }
        variant="secondary"
        size="sm"
      >
        Recheck
      </Button>
      <ActionMessage state={action} />
    </div>
  );
}
