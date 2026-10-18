import { useState } from 'react';
import { request } from '../../../../../shared/api/client';
import { stringValue } from '../../../../../shared/api/json-response';
import { useApiResource } from '../../../../../shared/hooks/use-api-resource';
import { useAction } from '../../../../../shared/hooks/use-action';
import ActionMessage from '../../../../../shared/components/action-message';
import RecordDetails from '../../../../../shared/components/record-details';
import Pagination from '../../../../../shared/components/pagination';
import { recordsSchema } from '../../../repair.api';

export default function BrokenEntries() {
  const entries = useApiResource({ path: 'api/repair/health?status=broken', parse: recordsSchema.parse, pollIntervalMs: 15000 });
  const [page, setPage] = useState(1);
  const action = useAction();
  if (entries.state.kind === 'loading') return <p>Loading broken entries…</p>;
  if (entries.state.kind === 'error') return <p role="alert">{entries.state.message}</p>;
  const totalPages = Math.max(1, Math.ceil(entries.state.value.length / 25));
  const currentPage = Math.min(page, totalPages);

  return <section className="card bg-base-100 p-5 space-y-4">
    <h2 className="text-xl">Broken Entries ({entries.state.value.length})</h2>
    {entries.state.value.length === 0 ? <p>No broken entries.</p> : entries.state.value.slice((currentPage - 1) * 25, currentPage * 25).map((entry) => <div key={stringValue(entry.entry_name)} className="border-b border-base-300 pb-3">
      <details><summary className="cursor-pointer">{stringValue(entry.display_name) || stringValue(entry.entry_name)} · {stringValue(entry.failure_reason)}</summary><RecordDetails value={entry} /></details>
      <div className="flex gap-2 mt-2">
        <button className="btn btn-xs" disabled={action.isPending} onClick={() => action.run(async () => { await request(`api/repair/health/${encodeURIComponent(stringValue(entry.entry_name))}/check`, { method: 'POST' }); entries.reload(); return 'Recheck requested.'; })}>Recheck</button>
        <button className="btn btn-xs btn-warning" disabled={action.isPending} onClick={() => {
          if (!confirm('Queue a replacement for this entry?')) return;
          action.run(async () => { await request('api/repair/fix', { method: 'POST', json: { names: [entry.entry_name] } }); entries.reload(); return 'Repair requested.'; });
        }}>Repair</button>
      </div>
    </div>)}
    <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
    <ActionMessage state={action.state} />
  </section>;
}
