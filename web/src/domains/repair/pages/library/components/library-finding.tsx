import { Button } from '@/shared/components/ui/button';
import { useState } from 'react';
import { repairKeys } from '../../../repair.queries';
import { Link } from 'react-router-dom';
import { appUrl, request } from '../../../../../shared/api/client';
import { stringValue, numberValue } from '../../../../../shared/api/json-response';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../../shared/components/action-message';
import RecordDetails from '../../../../../shared/components/record-details';
import { findingChangedAt, type LibraryFinding as Finding } from '../library-findings';

export default function LibraryFinding({
  finding,
  maxRetries,
}: {
  finding: Finding;
  maxRetries: number;
}) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
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
  return (
    <article className="p-4 border-b border-border flex flex-col gap-2">
      <h3 className="font-semibold">{finding.label}</h3>
      <p>
        {stringValue(file.arr_name)} ·{' '}
        {health?.status === 'healthy'
          ? 'Readable'
          : stringValue(health?.failure_reason) || 'Awaiting a library read'}{' '}
        · {stringValue(job?.status).replaceAll('_', ' ') || 'Not queued'}
      </p>
      {job?.status === 'ready' && finding.category !== 'resolved' ? (
        <p>Imported; read validation pending.</p>
      ) : null}
      {job?.lastError ? <p className="text-destructive">{stringValue(job.lastError)}</p> : null}
      <p className="text-sm">
        Changed:{' '}
        {findingChangedAt(finding) ? new Date(findingChangedAt(finding)).toLocaleString() : '—'} ·
        Attempts: {numberValue(job?.retryCount)}/{maxRetries} · Next attempt:{' '}
        {stringValue(job?.retryAt) || '—'}
      </p>
      <div className="flex gap-2 flex-wrap">
        {health ? (
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate('recheck')}
            variant="secondary"
            size="sm"
          >
            Recheck
          </Button>
        ) : null}
        {canRetry ? (
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate('retry')}
            variant="secondary"
            size="sm"
          >
            Retry Now
          </Button>
        ) : null}
        {canRepair ? (
          <Button
            disabled={action.isPending}
            onClick={() => {
              if (confirm('Queue replacement through Sonarr/Radarr for this broken file?'))
                action.mutate('repair');
            }}
            variant="secondary"
            size="sm"
          >
            Repair
          </Button>
        ) : null}
        {health || isActive ? (
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate(isPaused ? 'resume' : 'pause')}
            variant="secondary"
            size="sm"
          >
            {isPaused ? 'Resume' : 'Suspend'}
          </Button>
        ) : null}
        {job?.status === 'needs_attention' ? (
          <Button asChild variant="secondary">
            <Link to="/repair/reacquire">Review Recovery</Link>
          </Button>
        ) : null}
        <Button asChild variant="secondary">
          <a href={appUrl(`api/repair/library/media?${link}`)} target="_blank" rel="noreferrer">
            Open in Arr
          </a>
        </Button>
      </div>
      <details onToggle={(event) => setIsDetailsOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer">Details</summary>
        {isDetailsOpen ? <RecordDetails value={{ health, job, file }} /> : null}
      </details>
      <ActionMessage state={action} />
    </article>
  );
}
