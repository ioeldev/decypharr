import { z } from 'zod';
import { jsonObjectSchema, stringValue } from '../../../../shared/api/json-response';

export const libraryFindingsPageSchema = z.object({
  findings: z.array(z.object({
    health: jsonObjectSchema.nullable(), job: jsonObjectSchema.nullable(), file: jsonObjectSchema,
    label: z.string(), category: z.enum(['pending', 'resolved', 'attention', 'active']), season: z.number().nullable(),
  })).max(100),
  total: z.number().int().nonnegative(), page: z.number().int().positive(),
  limit: z.number().int().positive().max(100), maxRetries: z.number().int().nonnegative(),
});
export type LibraryFinding = z.infer<typeof libraryFindingsPageSchema>['findings'][number];

export function findingChangedAt(finding: LibraryFinding): number {
  const health = finding.health ?? {};
  const job = finding.job ?? {};
  return Math.max(timestamp(health.status_changed_at) || Math.max(timestamp(health.last_failed_at), timestamp(health.last_ok_at)),
    timestamp(job.phaseStartedAt) || timestamp(job.completedAt) || timestamp(job.startedAt) || timestamp(job.createdAt));
}

export function findingGroup(finding: LibraryFinding): string {
  if (finding.file.arr_kind !== 'sonarr') return JSON.stringify([finding.label, finding.file.arr_name]);

  return JSON.stringify([finding.file.arr_name, finding.file.arr_fingerprint, finding.file.media_id, finding.season]);
}

export function seriesLabel(finding: LibraryFinding): string {
  const parts = stringValue(finding.file.source_path).split('/').filter(Boolean);
  const parent = parts.at(-2) ?? '';
  return (/^(?:(?:season|saison)\s+\d+|specials)$/i.test(parent) ? parts.at(-3) : parent) || finding.label;
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > 0 ? time : 0;
}
