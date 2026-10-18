import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { repairKeys, bindingIndexQuery } from '../../../repair.queries';
import { request } from '../../../../../shared/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../../shared/components/action-message';
import RecordDetails from '../../../../../shared/components/record-details';

export default function BindingIndex() {
  const index = useQuery(bindingIndexQuery());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl">Arr Binding Index</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <Button
          disabled={action.isPending}
          onClick={() =>
            action.mutate(async () => {
              await request('api/arr/index/refresh', { method: 'POST' });
              return 'Index refresh queued.';
            })
          }
          variant="secondary"
          size="sm"
          className="w-fit"
        >
          Rebuild Index
        </Button>
        {index.data !== undefined ? <RecordDetails value={index.data} /> : null}
        {index.isError && !index.data ? <p role="alert">{index.error.message}</p> : null}
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
