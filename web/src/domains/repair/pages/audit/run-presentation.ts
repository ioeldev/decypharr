import { numberValue, objectValue, stringValue, type JsonObject } from '../../../../shared/api/json-response';

export function presentRun(run: JsonObject): JsonObject {
  const { repaired, ...stats } = objectValue(run.stats);
  const legacyRequests = Math.max(0, numberValue(repaired) - numberValue(stats.queued) - numberValue(stats.restored));
  const isSubmission = run.status === 'completed' && stringValue(run.source).startsWith('fix-broken:');
  return {
    ...run,
    status: isSubmission ? 'Submission complete' : run.status ?? '',
    stats: { ...stats, ...(legacyRequests > 0 ? { 'recovery requested (legacy)': legacyRequests } : {}) },
  };
}
