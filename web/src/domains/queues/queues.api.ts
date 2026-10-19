import { request, requestJson } from '../../shared/api/client';
import type { QueueEntry, QueueFilters, QueuePage } from './queues.types';

export async function getQueue(filters: QueueFilters, signal: AbortSignal): Promise<QueuePage> {
  const separator = filters.sort.lastIndexOf(':');
  const parameters = new URLSearchParams({
    page: String(filters.page),
    limit: '20',
    search: filters.search,
    category: filters.category,
    state: filters.state,
    sort_by: filters.sort.slice(0, separator),
    sort_order: filters.sort.slice(separator + 1),
  });
  const response = await requestJson(`api/torrents?${parameters}`, { signal });

  if (!isQueuePage(response)) throw new Error('The server returned an invalid queue response.');

  return response;
}

export async function deleteQueueEntries(options: {
  hashes: string[];
  removeFromProvider: boolean;
}): Promise<void> {
  const parameters = new URLSearchParams({
    hashes: options.hashes.join(','),
    removeFromDebrid: String(options.removeFromProvider),
  });

  await request(`api/torrents?${parameters}`, { method: 'DELETE' });
}

function isQueuePage(value: unknown): value is QueuePage {
  if (typeof value !== 'object' || value === null) return false;

  return 'torrents' in value && Array.isArray(value.torrents) && value.torrents.every(isQueueEntry)
    && 'categories' in value && Array.isArray(value.categories)
    && value.categories.every((category: unknown) => typeof category === 'string')
    && 'total' in value && typeof value.total === 'number'
    && 'total_pages' in value && typeof value.total_pages === 'number';
}

function isQueueEntry(value: unknown): value is QueueEntry {
  if (typeof value !== 'object' || value === null) return false;
  if (!('info_hash' in value) || typeof value.info_hash !== 'string') return false;
  if (!('name' in value) || typeof value.name !== 'string') return false;

  const strings = ['category', 'protocol', 'active_provider', 'state'];
  const numbers = ['size', 'progress', 'speed', 'dlspeed', 'num_seeds'];

  return Object.entries(value).every(([key, field]) => {
    if (strings.includes(key)) return typeof field === 'string';
    if (numbers.includes(key)) return typeof field === 'number' && Number.isFinite(field);

    return true;
  });
}
