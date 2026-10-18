import { repairKeys, recoveryJobsQuery } from '../../repair.queries';
import { useState } from 'react';
import { request } from '../../../../shared/api/client';
import { stringValue } from '../../../../shared/api/json-response';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../shared/components/action-message';
import Pagination from '../../../../shared/components/pagination';
import RepairNavigation from '../../components/repair-navigation';
import RecoveryQueue from '../../components/recovery-queue';
import RecoveryJob from './components/recovery-job';
import ManualRecovery from './components/manual-recovery';
import BindingIndex from './components/binding-index';

export default function RecoveryPage() {
  const jobs = useQuery(recoveryJobsQuery());
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(new Set<string>());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  const filtered = jobs.data !== undefined ? jobs.data.filter((job) => !filter || job.status === filter) : [];
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <div className="space-y-5"><h1 className="text-2xl font-bold">Recovery Jobs</h1><RepairNavigation /><RecoveryQueue />
    <div className="flex gap-3">
      <button className="btn btn-sm" onClick={() => void jobs.refetch()}>Refresh</button>
      <select className="select select-sm" aria-label="Job status" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}><option value="">All statuses</option>
        {['queued', 'resolving', 'invalidating', 'blocklisting', 'searching', 'waiting_for_grab', 'waiting_for_download', 'waiting_for_import', 'retry_scheduled', 'needs_attention', 'ready', 'failed', 'cancelled'].map((status) => <option key={status}>{status}</option>)}
      </select>
      <select className="select select-sm" aria-label="Jobs per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50].map((size) => <option key={size}>{size}</option>)}</select>
      <button className="btn btn-sm" onClick={() => setSelected(new Set(visible.filter((job) => ['ready', 'failed', 'cancelled'].includes(stringValue(job.status))).map((job) => stringValue(job.id))))}>Select Completed on Page</button>
      <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear Selection</button>
      <button className="btn btn-sm btn-error" disabled={selected.size === 0 || action.isPending} onClick={() => {
        if (!confirm(`Delete ${selected.size} selected job records?`)) return;
        action.mutate(async () => { await request('api/arr/reacquire/jobs', { method: 'DELETE', json: { ids: [...selected] } }); setSelected(new Set()); return 'Job records deleted.'; });
      }}>Delete Selected ({selected.size})</button>
    </div>
    <ActionMessage state={action} />
    {jobs.data !== undefined && jobs.error?.message ? <p role="alert">{jobs.error?.message}</p> : null}
    {jobs.isPending ? <p>Loading jobs…</p> : null}
    {(jobs.isError && !jobs.data) ? <p role="alert">{jobs.error.message}</p> : null}
    {visible.map((job) => <RecoveryJob key={stringValue(job.id)} job={job} isSelected={selected.has(stringValue(job.id))} onSelect={(isSelected) => {
      const next = new Set(selected);
      if (isSelected) next.add(stringValue(job.id));
      if (!isSelected) next.delete(stringValue(job.id));
      setSelected(next);
    }} />)}
    <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
    <ManualRecovery /><BindingIndex />
  </div>;
}
