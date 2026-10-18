import { expect, test } from 'bun:test';
import { libraryFindingsPageSchema, findingChangedAt, findingGroup } from './library-findings';

const finding = { health: { status_changed_at: '2026-03-01', updated_at: '2099-01-01', last_checked_at: '2099-01-01' }, job: null, file: { arr_kind: 'sonarr', arr_name: 'shows', arr_fingerprint: 'a', media_id: 9 }, label: 'Episode', category: 'pending' as const, season: 1 };

test('observation updates do not move unchanged findings to the top', () => {
  expect(findingChangedAt(finding)).toBe(Date.parse('2026-03-01'));
});

test('seasons and Arr instances have separate display groups', () => {
  expect(findingGroup(finding)).not.toBe(findingGroup({ ...finding, season: 2 }));
  expect(findingGroup(finding)).not.toBe(findingGroup({ ...finding, file: { ...finding.file, arr_fingerprint: 'b' } }));
});

test('findings responses must be bounded pages', () => {
  const page = { findings: [finding], total: 10000, page: 1, limit: 50, maxRetries: 3 };
  expect(libraryFindingsPageSchema.parse(page).total).toBe(10000);
  expect(libraryFindingsPageSchema.safeParse({ ...page, findings: Array(101).fill(finding) }).success).toBe(false);
  expect(libraryFindingsPageSchema.safeParse({ incidents: [], jobs: [] }).success).toBe(false);
});
