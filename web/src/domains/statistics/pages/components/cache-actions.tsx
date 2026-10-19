import { Button } from '@/shared/components/ui/button';
import { statisticsKeys } from '../../statistics.queries';
import { request } from '../../../../shared/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../shared/components/action-message';

export default function CacheActions() {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: statisticsKeys.all }),
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 flex-wrap">
        <Button
          disabled={action.isPending}
          onClick={() =>
            action.mutate(async () => {
              await request('api/mount/cache/cleanup', { method: 'POST' });
              return 'Cache cleanup completed.';
            })
          }
          variant="secondary"
          size="sm"
        >
          Clean Up Cache
        </Button>
        <Button
          disabled={action.isPending}
          onClick={() => {
            if (!confirm('Purge the mount cache? Cached data will need to be downloaded again.'))
              return;
            action.mutate(async () => {
              await request('api/mount/cache/purge', { method: 'POST' });
              return 'Cache purged.';
            });
          }}
          variant="secondary"
          size="sm"
        >
          Purge Cache
        </Button>
      </div>
      <ActionMessage state={action} />
    </div>
  );
}
