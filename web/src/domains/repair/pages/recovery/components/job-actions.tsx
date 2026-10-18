import { Button } from '@/shared/components/ui/button';
import { repairKeys } from '../../../repair.queries';
import { request } from '../../../../../shared/api/client';
import { stringValue, type JsonObject } from '../../../../../shared/api/json-response';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../../shared/components/action-message';

export default function JobActions({ job }: { job: JsonObject }) {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  const path = `api/arr/reacquire/jobs/${encodeURIComponent(stringValue(job.id))}`;
  const status = stringValue(job.status);
  const isTerminal = ['ready', 'failed', 'cancelled'].includes(status);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        {status === 'retry_scheduled' || status === 'needs_attention' ? (
          <Button
            disabled={action.isPending}
            onClick={() =>
              action.mutate(async () => {
                await request(`${path}/retry`, { method: 'POST', json: {} });
                return 'Retry requested.';
              })
            }
            variant="secondary"
            size="sm"
          >
            Retry Now
          </Button>
        ) : null}
        {isTerminal ? null : (
          <Button
            disabled={action.isPending}
            onClick={() =>
              action.mutate(async () => {
                await request(`${path}/pause`, { method: 'POST', json: { paused: !job.paused } });
                return job.paused ? 'Resume requested.' : 'Suspension requested.';
              })
            }
            variant="secondary"
            size="sm"
          >
            {job.paused ? 'Resume' : 'Suspend'}
          </Button>
        )}
        {status === 'needs_attention' ? (
          <Button
            disabled={action.isPending}
            onClick={() => {
              if (
                !confirm(
                  'Check this job’s actions in Arr first. Acknowledgement releases duplicate protection and allows another reacquisition. Have you checked the remote actions?',
                )
              )
                return;
              action.mutate(async () => {
                await request(`${path}/acknowledge`, { method: 'POST' });
                return 'Arr actions acknowledged.';
              });
            }}
            variant="secondary"
            size="sm"
          >
            Acknowledge Arr Actions
          </Button>
        ) : null}
      </div>
      <ActionMessage state={action} />
    </div>
  );
}
