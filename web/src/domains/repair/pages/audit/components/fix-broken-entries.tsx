import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { request } from '@/shared/api/client';
import { Button } from '@/shared/components/ui/button';
import ActionMessage from '@/shared/components/action-message';
import { repairKeys } from '../../../repair.queries';

export default function FixBrokenEntries() {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: () =>
      request('api/repair/fix', { method: 'POST', json: {} }).then(
        () => 'Recovery submission started.',
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={action.isPending}
        onClick={() => {
          if (!confirm('Send delete and re-search requests for all broken entries to their Arr?'))
            return;

          action.mutate();
        }}
      >
        <Wrench data-icon="inline-start" />
        Repair all broken entries
      </Button>
      <ActionMessage state={action} />
    </div>
  );
}
