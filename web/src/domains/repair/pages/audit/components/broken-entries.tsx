import { repairKeys, brokenEntriesQuery } from '../../../repair.queries';
import { useState } from 'react';
import { request } from '../../../../../shared/api/client';
import { stringValue } from '../../../../../shared/api/json-response';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../../shared/components/action-message';
import RecordDetails from '../../../../../shared/components/record-details';
import Pagination from '../../../../../shared/components/pagination';

export default function BrokenEntries() {
  const entries = useQuery(brokenEntriesQuery());
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  if (entries.isPending) return <p>Loading broken entries…</p>;
  if (entries.isError && !entries.data) return <p role="alert">{entries.error.message}</p>;
  const totalPages = Math.max(1, Math.ceil(entries.data.length / 25));
  const currentPage = Math.min(page, totalPages);

  return <section className="card bg-base-100 p-5 space-y-4">
    {entries.isError ? <p role="alert">{entries.error.message} Showing the last received data.</p> : null}
    <h2 className="text-xl">Broken Entries ({entries.data.length})</h2>
    {entries.data.length === 0 ? <p>No broken entries.</p> : entries.data.slice((currentPage - 1) * 25, currentPage * 25).map((entry) => <div key={stringValue(entry.entry_name)} className="border-b border-base-300 pb-3">
      <details><summary className="cursor-pointer">{stringValue(entry.display_name) || stringValue(entry.entry_name)} · {stringValue(entry.failure_reason)}</summary><RecordDetails value={entry} /></details>
      <div className="flex gap-2 mt-2">
        <button className="btn btn-xs" disabled={action.isPending} onClick={() => action.mutate(async () => { await request(`api/repair/health/${encodeURIComponent(stringValue(entry.entry_name))}/check`, { method: 'POST' }); return 'Recheck requested.'; })}>Recheck</button>
        <button className="btn btn-xs btn-warning" disabled={action.isPending} onClick={() => {
          if (!confirm('Queue a replacement for this entry?')) return;
          action.mutate(async () => { await request('api/repair/fix', { method: 'POST', json: { names: [entry.entry_name] } }); return 'Repair requested.'; });
        }}>Repair</button>
      </div>
    </div>)}
    <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
    <ActionMessage state={action} />
  </section>;
}
