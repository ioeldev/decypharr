import { Checkbox } from '@/shared/components/ui/checkbox';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/components/ui/dropdown-menu';
import RowActions from '@/shared/components/row-actions';
import ActionMessage from '@/shared/components/action-message';
import {
  arrayValue,
  numberValue,
  objectValue,
  stringValue,
  type JsonObject,
} from '@/shared/api/json-response';
import RepairListRow from '../../../components/repair-list-row';
import RepairStatus from '../../../components/repair-status';
import RepairDiagnostics from '../../../components/repair-diagnostics';
import { useRecoveryJobActions } from '../hooks/use-recovery-job-actions';
import RecoveryMediaLabel from './recovery-media-label';

type RecoveryJobProps = {
  job: JsonObject;
  isSelected: boolean;
  onSelect: (isSelected: boolean) => void;
};

export default function RecoveryJob({ job, isSelected, onSelect }: RecoveryJobProps) {
  const action = useRecoveryJobActions(job);
  const uncached = objectValue(job.uncached);
  const binding = objectValue(arrayValue(job.bindings)[0]);
  const status = stringValue(job.status);
  const isTerminal = ['ready', 'failed', 'cancelled'].includes(status);
  const label = `job ${stringValue(job.id)}`;
  const reason = stringValue(job.lastError) || stringValue(job.retryReason).replaceAll('_', ' ');

  return (
    <RepairListRow
      label={label}
      title={<RecoveryMediaLabel binding={binding} />}
      description={
        <>
          {stringValue(job.arrName)} · {reason || stringValue(job.createdAt)}
          {job.paused ? ' · Suspended' : ''}
        </>
      }
      status={<RepairStatus status={status} />}
      selection={
        <Checkbox
          aria-label={`Select ${label}`}
          disabled={!isTerminal}
          checked={isSelected}
          onCheckedChange={(isChecked) => onSelect(isChecked === true)}
        />
      }
      actions={
        <RowActions label={label} disabled={action.isPending}>
          {status === 'retry_scheduled' || status === 'needs_attention' ? (
            <DropdownMenuItem onSelect={() => action.mutate('retry')}>Retry Now</DropdownMenuItem>
          ) : null}
          {isTerminal ? (
            <DropdownMenuItem disabled>No available actions</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => action.mutate('pause')}>
              {job.paused ? 'Resume' : 'Suspend'}
            </DropdownMenuItem>
          )}
          {status === 'needs_attention' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  if (
                    !confirm(
                      'Check this job’s actions in Arr first. Acknowledgement releases duplicate protection and allows another reacquisition. Have you checked the remote actions?',
                    )
                  )
                    return;
                  action.mutate('acknowledge');
                }}
              >
                Acknowledge Arr Actions
              </DropdownMenuItem>
            </>
          ) : null}
        </RowActions>
      }
      feedback={<ActionMessage state={action} />}
    >
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{stringValue(job.createdAt) || '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Attempts</dt>
          <dd>{numberValue(job.retryCount)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Next attempt</dt>
          <dd>{stringValue(job.retryAt) || '—'}</dd>
        </div>
      </dl>
      {job.uncached ? (
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Uncached recovery</dt>
            <dd>{stringValue(uncached.phase).replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last byte progress</dt>
            <dd>{stringValue(uncached.lastProgressAt) || 'Waiting for observation'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Capacity reserved</dt>
            <dd>{uncached.reserved ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
      ) : null}
      {job.lastError ? (
        <p className="break-words text-destructive">{stringValue(job.lastError)}</p>
      ) : null}
      {job.observationError ? (
        <p className="break-words text-warning-foreground">
          Observation unavailable: {stringValue(job.observationError)}
        </p>
      ) : null}
      <p className="break-all text-xs text-muted-foreground">{stringValue(binding.libraryPath) || stringValue(binding.entryFileName) || stringValue(binding.entryName)}</p>
      <RepairDiagnostics value={job} />
    </RepairListRow>
  );
}
