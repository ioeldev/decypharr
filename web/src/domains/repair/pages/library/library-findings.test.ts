import { expect, test } from 'bun:test';
import { buildFindings, findingChangedAt, findingGroup } from './library-findings';

test('replacement file IDs match only the same Arr instance; import is not proof of health', () => {
  const health = { status: 'broken', last_failed_at: '2026-10-01', library_file: { arr_name: 'movies', arr_fingerprint: 'a', arr_kind: 'radarr', media_id: 9, arr_file_id: 43 } };
  const binding = { arrName: 'movies', arrInstanceFingerprint: 'a', movieId: 9, arrFileId: 42 };
  const job = { id: 'job', status: 'ready', createdAt: '2026-10-02', bindings: [binding] };
  expect(buildFindings({ incidents: [health], jobs: [job] })[0]?.category).toBe('active');
  health.status = 'healthy';
  expect(buildFindings({ incidents: [health], jobs: [job] })[0]?.category).toBe('resolved');
  binding.arrInstanceFingerprint = 'changed';
  expect(buildFindings({ incidents: [health], jobs: [job] })[0]?.job).toBeNull();
});

test('legacy seasons remain distinct, including specials and unknown seasons', () => {
  const paths = ['Season 1/file.mkv', 'Season 2/file.mkv', 'Example.S03E01.mkv', 'file.mkv', 'Specials/file.mkv'];
  const findings = buildFindings({ incidents: paths.map((path, index) => ({ status: 'broken', library_file: { arr_name: 'shows', arr_fingerprint: 'a', arr_kind: 'sonarr', media_id: 9, episode_id: index, source_path: `/tv/Example/${path}` } })), jobs: [] });
  expect(findings.map((finding) => finding.season)).toEqual([1, 2, 3, null, 0]);
  expect(new Set(findings.map(findingGroup)).size).toBe(5);
});

test('observation updates do not move unchanged findings to the top', () => {
  const finding = buildFindings({ incidents: [{ status: 'broken', status_changed_at: '2026-03-01', updated_at: '2099-01-01', last_checked_at: '2099-01-01', library_file: {} }] })[0];
  if (!finding) throw new Error('Expected a finding');
  expect(findingChangedAt(finding)).toBe(Date.parse('2026-03-01'));
});
