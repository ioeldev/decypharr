import { FieldGroup } from '@/shared/components/ui/field';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { repairKeys } from '../../../repair.queries';
import { request } from '../../../../../shared/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import FormField from '../../../../../shared/components/form-field';
import ActionMessage from '../../../../../shared/components/action-message';
import { healthStates } from '../../../repair.api';

export default function RepairMaintenance() {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  return (
    <Card className="flex flex-col gap-5">
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl">Recheck Arr Media</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            action.mutate(async () => {
              await request('api/repair/recheck/media', {
                method: 'POST',
                json: {
                  arr: fields.get('arr'),
                  media_id: fields.get('media_id'),
                  fix: fields.has('fix'),
                },
              });
              return 'Media recheck requested.';
            });
          }}
          className="flex gap-4 items-end flex-wrap"
        >
          <FieldGroup>
            <FormField name="arr" label="Arr name" required />
            <FormField name="media_id" label="Media ID" required />
            <FormField name="fix" label="Repair broken files" type="checkbox" />
            <Button disabled={action.isPending} variant="secondary">
              Recheck
            </Button>
          </FieldGroup>
        </form>
        <h2 className="text-xl">Clear Health State</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const statuses = new FormData(event.currentTarget).getAll('status');
            if (!confirm('Clear the selected health states?')) return;
            action.mutate(async () => {
              if (statuses.length === 0) throw new Error('Select at least one health state.');
              await request('api/repair/clear-state', { method: 'POST', json: { statuses } });
              return 'Health states cleared.';
            });
          }}
          className="flex flex-col gap-3"
        >
          <FieldGroup>
            <div className="flex gap-4 flex-wrap">
              {healthStates.map((status) => (
                <FormField
                  key={status}
                  label={status}
                  type="checkbox"
                  name="status"
                  value={status}
                />
              ))}
            </div>
            <Button disabled={action.isPending} variant="secondary">
              Clear Selected States
            </Button>
          </FieldGroup>
        </form>
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
