import { useState } from 'react';
import { arrayValue, objectValue, stringValue, type JsonObject } from '../../../../../shared/api/json-response';
import RecordDetails from '../../../../../shared/components/record-details';
import JobActions from './job-actions';
import RecoveryMediaLabel from './recovery-media-label';

export default function RecoveryJob({ job, isSelected, onSelect }: { job: JsonObject; isSelected: boolean; onSelect: (isSelected: boolean) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const binding = objectValue(arrayValue(job.bindings)[0]);
  const status = stringValue(job.status);
  const isTerminal = ['ready', 'failed', 'cancelled'].includes(status);

  return <article className="card bg-base-100 p-5 space-y-3">
    <div className="flex gap-3 items-center">
      <input type="checkbox" className="checkbox" aria-label={`Select job ${stringValue(job.id)}`} disabled={!isTerminal} checked={isSelected} onChange={(event) => onSelect(event.target.checked)} />
      <div className="flex-1"><RecoveryMediaLabel binding={binding} /></div>
      <span className="badge">{status.replaceAll('_', ' ')}</span>
    </div>
    <p>{stringValue(job.arrName)} · {stringValue(job.createdAt)}{job.paused ? ' · Suspended' : ''}</p>
    {job.lastError ? <p className="text-error">{stringValue(job.lastError)}</p> : null}
    {job.observationError ? <p className="text-warning">Observation unavailable: {stringValue(job.observationError)}</p> : null}
    {job.retryAt ? <p>Next attempt: {stringValue(job.retryAt)}</p> : null}
    <JobActions job={job} />
    <button className="btn btn-sm w-fit" aria-expanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)}>{isExpanded ? 'Hide details' : 'Details'}</button>
    {isExpanded ? <div className="space-y-4"><RecordDetails value={job} /></div> : null}
  </article>;
}
