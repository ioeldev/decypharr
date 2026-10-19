import { numberValue, objectValue, stringValue, type JsonObject } from '@/shared/api/json-response';

type RecoveryQueueSummary = {
  total: number;
  imported: number;
  inFlight: number;
  queued: number;
  nextStart: string;
  activity: string;
  importedPercent: number;
  searching: number;
  downloading: number;
  importing: number;
  attention: number;
  retrying: number;
  cancelled: number;
};

export function summarizeRecoveryQueue(
  status: JsonObject,
  nowMs = Date.now(),
): RecoveryQueueSummary {
  const counts = objectValue(status.status_counts);
  const total = numberValue(status.total);
  const imported = numberValue(counts.ready);
  const inFlight = numberValue(status.in_flight);
  const queued = numberValue(status.queued);
  const nextAllowedMs = Date.parse(stringValue(status.next_allowed_at));
  const nextStart = nextAllowedMs > nowMs ? new Date(nextAllowedMs).toLocaleString() : '';
  const hasQueuedWork = queued > 0 || numberValue(counts.retry_scheduled) > 0;
  let activity = 'No recoveries waiting to start.';

  if (hasQueuedWork) {
    activity = nextStart
      ? `Next start allowed ${nextStart}.`
      : 'Waiting recoveries start as capacity becomes available.';
  }

  if (inFlight > 0) activity = 'Following replacement searches, downloads, and imports.';

  return {
    total,
    imported,
    inFlight,
    queued,
    nextStart,
    activity,
    importedPercent: total > 0 ? Math.min(100, Math.round((imported / total) * 100)) : 0,
    searching: [
      'resolving',
      'invalidating',
      'blocklisting',
      'searching',
      'waiting_for_grab',
    ].reduce((count, stage) => count + numberValue(counts[stage]), 0),
    downloading: numberValue(counts.waiting_for_download),
    importing: numberValue(counts.waiting_for_import),
    attention: numberValue(counts.needs_attention) + numberValue(counts.failed),
    retrying: numberValue(counts.retry_scheduled),
    cancelled: numberValue(counts.cancelled),
  };
}
