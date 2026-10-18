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
  return <section className="card bg-base-100 p-5 space-y-3"><h2 className="text-xl">Arr Binding Index</h2>
    <button className="btn btn-sm w-fit" disabled={action.isPending} onClick={() => action.mutate(async () => { await request('api/arr/index/refresh', { method: 'POST' }); return 'Index refresh queued.'; })}>Rebuild Index</button>
    {index.data !== undefined ? <RecordDetails value={index.data} /> : null}
    {(index.isError && !index.data) ? <p role="alert">{index.error.message}</p> : null}
    <ActionMessage state={action} />
  </section>;
}
