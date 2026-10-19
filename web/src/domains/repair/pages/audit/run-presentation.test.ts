import { expect, test } from 'bun:test';
import { presentRun } from './run-presentation';

test('submission completion and legacy repair requests do not claim restored files', () => {
  const run = presentRun({ status: 'completed', source: 'fix-broken:all', stats: { repaired: 1668 } });
  expect(run.status).toBe('Submission complete');
  expect(run.stats).toEqual({ 'recovery requested (legacy)': 1668 });
  expect(presentRun({ stats: { repaired: 10, queued: 7, restored: 3 } }).stats).toEqual({ queued: 7, restored: 3 });
});
