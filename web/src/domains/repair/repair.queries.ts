import { libraryFindingsPageSchema } from './pages/library/library-findings';
import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../shared/api/client';
import { jsonObjectSchema } from '../../shared/api/json-response';
import { recordsSchema } from './repair.api';
import { healthSchema } from '../library/library.api';

export const repairKeys = { all: ['repair'] as const };

export function repairConfigQuery() {
  return queryOptions({
    queryKey: [...repairKeys.all, 'configuration'],
    queryFn: ({ signal }) => requestJson('api/repair/config', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(jsonObjectSchema.parse),
  });
}

export function repairStatusQuery() {
  return queryOptions({
    queryKey: [...repairKeys.all, 'status'],
    queryFn: ({ signal }) => requestJson('api/repair/status', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(jsonObjectSchema.parse),
    refetchInterval: 2000,
  });
}

export function repairHistoryQuery() {
  return queryOptions({
    queryKey: [...repairKeys.all, 'runs'],
    queryFn: ({ signal }) => requestJson('api/repair/runs', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(recordsSchema.parse),
    refetchInterval: 15000,
  });
}

export function brokenEntriesQuery() {
  return queryOptions({
    queryKey: [...repairKeys.all, 'health', 'broken'],
    queryFn: ({ signal }) => requestJson('api/repair/health?status=broken', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(recordsSchema.parse),
    refetchInterval: 15000,
  });
}

export function entryHealthQuery(name: string) {
  return queryOptions({
    queryKey: [...repairKeys.all, 'health', 'entry', name],
    queryFn: ({ signal }) => requestJson(`api/repair/health/${encodeURIComponent(name)}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(healthSchema.parse),
  });
}

export function libraryFindingsQuery(parameters: { page: number; search: string; status: string; sort: string }) {
  const search = new URLSearchParams({ ...parameters, page: String(parameters.page), limit: '50' });
  return queryOptions({
    queryKey: [...repairKeys.all, 'findings', parameters],
    queryFn: ({ signal }) => requestJson(`api/repair/library?${search}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) }).then(libraryFindingsPageSchema.parse),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    gcTime: 60000,
  });
}

export function recoveryJobsQuery() {
  return queryOptions({
    queryKey: [...repairKeys.all, 'jobs'],
    queryFn: ({ signal }) => requestJson('api/arr/reacquire/jobs', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(recordsSchema.parse),
    refetchInterval: 5000,
  });
}

export function recoveryQueueQuery() {
  return queryOptions({
    queryKey: [...repairKeys.all, 'queue'],
    queryFn: ({ signal }) => requestJson('api/arr/reacquire/queue', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(jsonObjectSchema.parse),
    refetchInterval: 5000,
  });
}

export function bindingIndexQuery() {
  return queryOptions({
    queryKey: [...repairKeys.all, 'index'],
    queryFn: ({ signal }) => requestJson('api/arr/index', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(recordsSchema.parse),
    refetchInterval: 15000,
  });
}

export function bindingsQuery(query: string, arr: string) {
  const parameters = new URLSearchParams({ q: query, arr, limit: '50' });
  return queryOptions({
    queryKey: [...repairKeys.all, 'bindings', query, arr],
    queryFn: ({ signal }) => requestJson(`api/arr/bindings?${parameters}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(recordsSchema.parse),
  });
}
