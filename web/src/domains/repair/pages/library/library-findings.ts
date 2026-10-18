import { arrayValue, numberValue, objectValue, stringValue, type JsonObject } from '../../../../shared/api/json-response';

export interface LibraryFinding {
  health: JsonObject | null;
  job: JsonObject | null;
  file: JsonObject;
  label: string;
  category: 'pending' | 'resolved' | 'attention' | 'active';
  season: number | null;
}

export function buildFindings(snapshot: JsonObject): LibraryFinding[] {
  const jobs = arrayValue(snapshot.jobs).map(objectValue);
  const usedJobs = new Set<string>();
  const findings = arrayValue(snapshot.incidents).map(objectValue).map((health) => {
    const file = objectValue(health.library_file);
    const matches = jobs.filter((job) => arrayValue(job.bindings).some((binding) => matchesLibraryFile(file, objectValue(binding))))
      .sort((first, second) => timestamp(second.createdAt) - timestamp(first.createdAt));
    for (const job of matches) usedJobs.add(stringValue(job.id));
    return createFinding({ health, job: matches[0] ?? null, file });
  });

  for (const job of jobs) {
    const bindings = arrayValue(job.bindings).map(objectValue);
    if (usedJobs.has(stringValue(job.id))) continue;
    if (!job.libraryAudit && !bindings.some((binding) => binding.confidence === 'library_file')) continue;

    for (const binding of bindings) findings.push(createFinding({ health: null, job, file: {
      arr_name: stringValue(binding.arrName), arr_fingerprint: stringValue(binding.arrInstanceFingerprint),
      arr_kind: stringValue(binding.arrType), media_id: numberValue(binding.movieId) || numberValue(binding.seriesId),
      season_number: binding.seasonNumber ?? null, episode_id: arrayValue(binding.episodeIds)[0] ?? null,
      source_path: stringValue(binding.libraryPath),
    } }));
  }
  return findings;
}

export function matchesLibraryFile(file: JsonObject, binding: JsonObject): boolean {
  if (file.arr_name !== binding.arrName || file.arr_fingerprint !== binding.arrInstanceFingerprint) return false;
  if (numberValue(file.arr_file_id) > 0 && file.arr_file_id === binding.arrFileId) return true;
  if (file.arr_kind === 'radarr') return numberValue(file.media_id) > 0 && file.media_id === binding.movieId;

  return file.media_id === binding.seriesId && arrayValue(binding.episodeIds).includes(file.episode_id ?? null);
}

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

function createFinding({ health, job, file }: { health: JsonObject | null; job: JsonObject | null; file: JsonObject }): LibraryFinding {
  const label = stringValue(health?.display_name) || stringValue(file.source_path).split('/').slice(-2).join(' / ') || `Media ${numberValue(file.media_id)}`;
  const season = findSeason(file, job);
  const verified = health?.status === 'healthy' && Boolean(health.last_failed_at) && (!job || ['ready', 'cancelled'].includes(stringValue(job.status)));
  if (verified) return { health, job, file, label, season, category: 'resolved' };
  if (job && ['needs_attention', 'failed'].includes(stringValue(job.status))) return { health, job, file, label, season, category: 'attention' };
  if (job && ['resolving', 'invalidating', 'blocklisting', 'searching', 'waiting_for_grab', 'waiting_for_download', 'waiting_for_import', 'ready'].includes(stringValue(job.status))) {
    return { health, job, file, label, season, category: 'active' };
  }
  return { health, job, file, label, season, category: 'pending' };
}

function findSeason(file: JsonObject, job: JsonObject | null): number | null {
  if (typeof file.season_number === 'number' && Number.isInteger(file.season_number) && file.season_number >= 0) return file.season_number;

  const seasons = new Set(arrayValue(job?.bindings).map(objectValue).filter((binding) => matchesLibraryFile(file, binding))
    .map((binding) => binding.seasonNumber).filter((season): season is number => typeof season === 'number' && Number.isInteger(season) && season >= 0));
  if (seasons.size === 1) return [...seasons][0] ?? null;

  // Filenames are a display fallback only; actions use the persisted finding identity.
  const parts = stringValue(file.source_path).split('/');
  const parent = parts.at(-2) ?? '';
  const match = parent.match(/^(?:season|saison)\s+(\d+)$/i) ?? (parts.at(-1) ?? '').match(/(?:^|[ ._-])S(\d+)E\d+(?=$|[ ._-])/i);
  if (match) return Number(match[1]);
  return /^specials$/i.test(parent) ? 0 : null;
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > 0 ? time : 0;
}
