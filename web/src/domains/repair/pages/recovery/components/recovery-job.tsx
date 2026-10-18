import { Checkbox } from '@/shared/components/ui/checkbox';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useState } from 'react';
import {
  arrayValue,
  objectValue,
  stringValue,
  type JsonObject,
} from '../../../../../shared/api/json-response';
import RecordDetails from '../../../../../shared/components/record-details';
import JobActions from './job-actions';
import RecoveryMediaLabel from './recovery-media-label';

export default function RecoveryJob({
  job,
  isSelected,
  onSelect,
}: {
  job: JsonObject;
  isSelected: boolean;
  onSelect: (isSelected: boolean) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const binding = objectValue(arrayValue(job.bindings)[0]);
  const status = stringValue(job.status);
  const isTerminal = ['ready', 'failed', 'cancelled'].includes(status);
  return (
    <article className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="flex gap-3 items-center flex-wrap">
            <Checkbox
              aria-label={`Select job ${stringValue(job.id)}`}
              disabled={!isTerminal}
              checked={isSelected}
              onCheckedChange={(event) => onSelect(event === true)}
            />
            <div className="flex-1">
              <RecoveryMediaLabel binding={binding} />
            </div>
            <Badge variant="secondary">{status.replaceAll('_', ' ')}</Badge>
          </div>
          <p>
            {stringValue(job.arrName)} · {stringValue(job.createdAt)}
            {job.paused ? ' · Suspended' : ''}
          </p>
          {job.lastError ? <p className="text-destructive">{stringValue(job.lastError)}</p> : null}
          {job.observationError ? (
            <p className="text-warning-foreground">
              Observation unavailable: {stringValue(job.observationError)}
            </p>
          ) : null}
          {job.retryAt ? <p>Next attempt: {stringValue(job.retryAt)}</p> : null}
          <JobActions job={job} />
          <Button
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded(!isExpanded)}
            variant="secondary"
            size="sm"
            className="w-fit"
          >
            {isExpanded ? 'Hide details' : 'Details'}
          </Button>
          {isExpanded ? (
            <div className="flex flex-col gap-4">
              <RecordDetails value={job} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </article>
  );
}
