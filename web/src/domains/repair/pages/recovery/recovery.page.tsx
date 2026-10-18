import PageHeader from '@/shared/components/page-header';
import LoadingState from '@/shared/components/loading-state';
import { Button } from '@/shared/components/ui/button';
import { NativeSelectOption, NativeSelect } from '@/shared/components/ui/native-select';
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
  const filtered =
    jobs.data !== undefined ? jobs.data.filter((job) => !filter || job.status === filter) : [];
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Recovery Jobs"
        description="Track searches and restore missing media through your Arr applications."
      />
      <RepairNavigation />
      <RecoveryQueue />
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => void jobs.refetch()} variant="secondary" size="sm">
          Refresh
        </Button>
        <NativeSelect
          aria-label="Job status"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(1);
          }}
        >
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          {[
            'queued',
            'resolving',
            'invalidating',
            'blocklisting',
            'searching',
            'waiting_for_grab',
            'waiting_for_download',
            'waiting_for_import',
            'retry_scheduled',
            'needs_attention',
            'ready',
            'failed',
            'cancelled',
          ].map((status) => (
            <NativeSelectOption key={status}>{status}</NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Jobs per page"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
        >
          {[10, 25, 50].map((size) => (
            <NativeSelectOption key={size}>{size}</NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          onClick={() =>
            setSelected(
              new Set(
                visible
                  .filter((job) =>
                    ['ready', 'failed', 'cancelled'].includes(stringValue(job.status)),
                  )
                  .map((job) => stringValue(job.id)),
              ),
            )
          }
          variant="secondary"
          size="sm"
        >
          Select Completed on Page
        </Button>
        <Button onClick={() => setSelected(new Set())} variant="secondary" size="sm">
          Clear Selection
        </Button>
        <Button
          disabled={selected.size === 0 || action.isPending}
          onClick={() => {
            if (!confirm(`Delete ${selected.size} selected job records?`)) return;
            action.mutate(async () => {
              await request('api/arr/reacquire/jobs', {
                method: 'DELETE',
                json: { ids: [...selected] },
              });
              setSelected(new Set());
              return 'Job records deleted.';
            });
          }}
          variant="destructive"
          size="sm"
        >
          Delete Selected ({selected.size})
        </Button>
      </div>
      <ActionMessage state={action} />
      {jobs.data !== undefined && jobs.error?.message ? (
        <p role="alert">{jobs.error?.message}</p>
      ) : null}
      {jobs.isPending ? <LoadingState label="Loading jobs…" /> : null}
      {jobs.isError && !jobs.data ? <p role="alert">{jobs.error.message}</p> : null}
      {visible.map((job) => (
        <RecoveryJob
          key={stringValue(job.id)}
          job={job}
          isSelected={selected.has(stringValue(job.id))}
          onSelect={(isSelected) => {
            const next = new Set(selected);
            if (isSelected) next.add(stringValue(job.id));
            if (!isSelected) next.delete(stringValue(job.id));
            setSelected(next);
          }}
        />
      ))}
      <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
      <ManualRecovery />
      <BindingIndex />
    </div>
  );
}
