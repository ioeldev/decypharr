import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../shared/api/client';
import { browseSchema } from './library.api';

export const libraryKeys = { all: ['library'] as const };

export function browseQuery(directory: string, parameters: string) {
  return queryOptions({
    queryKey: [...libraryKeys.all, 'browse', directory, parameters],
    queryFn: ({ signal }) => requestJson(`api/browse/${directory}?${parameters}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }).then(browseSchema.parse),
  });
}
