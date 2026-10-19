import RowActions from '@/shared/components/row-actions';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/components/ui/dropdown-menu';
import RepairListRow from '../../../components/repair-list-row';
import RepairStatus from '../../../components/repair-status';
import RepairDiagnostics from '../../../components/repair-diagnostics';
import { repairKeys } from '../../../repair.queries';
import { Link } from 'react-router-dom';
import { appUrl, request } from '../../../../../shared/api/client';
import { stringValue, numberValue } from '../../../../../shared/api/json-response';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../../shared/components/action-message';
import { findingChangedAt, type LibraryFinding as Finding } from '../library-findings';

export default function LibraryFinding({
  finding,
  maxRetries,
}: {
  finding: Finding;
  maxRetries: number;
}) {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: changeFinding,
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  const { health, job, file } = finding;
  const isActive =
    job !== null && !['ready', 'failed', 'cancelled'].includes(stringValue(job.status));
  const isPaused = Boolean(health?.library_paused || job?.paused);
  const canRetry =
    job?.status === 'retry_scheduled' ||
    (job?.status === 'needs_attention' &&
      ['no_download', 'search_error'].includes(stringValue(job.retryReason)));
  const canRepair =
    health?.status === 'broken' && !health.library_removed && !isActive && !health.library_paused;
  const link = new URLSearchParams({
    arr: stringValue(file.arr_name),
    media: String(numberValue(file.media_id)),
  });
  async function changeFinding(
    operation: 'retry' | 'pause' | 'resume' | 'recheck' | 'repair',
  ): Promise<string> {
    const jobPath = `api/arr/reacquire/jobs/${encodeURIComponent(stringValue(job?.id))}`;
    const name = stringValue(health?.entry_name);
    if (operation === 'retry') {
      if (health?.library_paused)
        await request('api/repair/library/action', {
          method: 'POST',
          json: { name, action: 'resume' },
        });
      await request(`${jobPath}/retry`, { method: 'POST', json: {} });
      return 'Retry requested.';
    }
    if (operation === 'pause' || operation === 'resume') {
      if (isActive)
        await request(`${jobPath}/pause`, {
          method: 'POST',
          json: { paused: operation === 'pause' },
        });
      if (health)
        await request('api/repair/library/action', {
          method: 'POST',
          json: { name, action: operation },
        });
      return `${operation === 'pause' ? 'Suspension' : 'Resume'} requested.`;
    }
    await request('api/repair/library/action', {
      method: 'POST',
      json: { name, action: operation },
    });
    return 'Action requested.';
  }
  const jobStatus = stringValue(job?.status);
  const status = isPaused ? 'suspended' : jobStatus || stringValue(health?.status) || 'pending';
  const reason =
    health?.status === 'healthy'
      ? 'Readable'
      : stringValue(health?.failure_reason) || 'Awaiting a library read';
  const changedAt = findingChangedAt(finding);

  return (
    <RepairListRow
      label={finding.label}
      title={
        <h3 className="truncate" title={finding.label}>
          {finding.label}
        </h3>
      }
      description={
        <>
          {stringValue(file.arr_name)} · {stringValue(job?.lastError) || reason}
        </>
      }
      status={<RepairStatus status={status} />}
      actions={
        <RowActions label={finding.label} disabled={action.isPending}>
          {health ? (
            <DropdownMenuItem onSelect={() => action.mutate('recheck')}>Recheck</DropdownMenuItem>
          ) : null}
          {canRetry ? (
            <DropdownMenuItem onSelect={() => action.mutate('retry')}>Retry Now</DropdownMenuItem>
          ) : null}
          {canRepair ? (
            <DropdownMenuItem
              onSelect={() => {
                if (confirm('Queue replacement through Sonarr/Radarr for this broken file?'))
                  action.mutate('repair');
              }}
            >
              Repair
            </DropdownMenuItem>
          ) : null}
          {health || isActive ? (
            <DropdownMenuItem onSelect={() => action.mutate(isPaused ? 'resume' : 'pause')}>
              {isPaused ? 'Resume' : 'Suspend'}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {job?.status === 'needs_attention' ? (
            <DropdownMenuItem asChild>
              <Link to="/repair/reacquire">Review Recovery</Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <a href={appUrl(`api/repair/library/media?${link}`)} target="_blank" rel="noreferrer">
              Open in Arr
            </a>
          </DropdownMenuItem>
        </RowActions>
      }
      feedback={<ActionMessage state={action} />}
    >
      <p className="break-words">{reason}</p>
      {job?.lastError ? (
        <p className="break-words text-destructive">{stringValue(job.lastError)}</p>
      ) : null}
      {job?.status === 'ready' && finding.category !== 'resolved' ? (
        <p>Imported; read validation pending.</p>
      ) : null}
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Changed</dt>
          <dd>{changedAt ? new Date(changedAt).toLocaleString() : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Attempts</dt>
          <dd>
            {numberValue(job?.retryCount)}/{maxRetries}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Next attempt</dt>
          <dd>{stringValue(job?.retryAt) || '—'}</dd>
        </div>
      </dl>
      <p className="break-all text-xs text-muted-foreground">{stringValue(file.source_path)}</p>
      <RepairDiagnostics value={{ health, job, file }} />
    </RepairListRow>
  );
}
