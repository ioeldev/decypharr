import { expect, test } from 'bun:test';
import { summarizeRecoveryQueue } from './recovery-queue-presentation';

test('recovery stages distinguish imported files, retries, failures, and work still in progress', () => {
  const summary = summarizeRecoveryQueue({
    total: 15,
    queued: 2,
    in_flight: 5,
    status_counts: {
      queued: 2,
      resolving: 1,
      searching: 1,
      waiting_for_grab: 1,
      waiting_for_download: 1,
      waiting_for_import: 1,
      ready: 3,
      retry_scheduled: 2,
      needs_attention: 1,
      failed: 1,
      cancelled: 1,
    },
  });

  expect(summary).toMatchObject({
    queued: 2,
    searching: 3,
    downloading: 1,
    importing: 1,
    imported: 3,
    importedPercent: 20,
    attention: 2,
    retrying: 2,
    cancelled: 1,
  });
});

test('an empty queue has no imported progress and an expired cooldown is not a future start', () => {
  const summary = summarizeRecoveryQueue(
    { next_allowed_at: '2026-01-01T00:00:00Z' },
    Date.parse('2026-01-02'),
  );

  expect(summary.importedPercent).toBe(0);
  expect(summary.nextStart).toBe('');
  expect(summary.activity).toBe('No recoveries waiting to start.');
});

test('work waiting on capacity or a future dispatch time is not described as idle', () => {
  const nowMs = Date.parse('2026-01-01');
  const summary = summarizeRecoveryQueue(
    { queued: 1, next_allowed_at: '2026-01-02T00:00:00Z' },
    nowMs,
  );

  expect(summary.nextStart).not.toBe('');
  expect(summary.activity).toContain('Next start allowed');
});
