import { z } from 'zod';
import { requestJson } from '../../shared/api/client';

export const downloadConfigSchema = z.object({
  download_folder: z.string().optional(),
  always_rm_tracker_urls: z.boolean().optional(),
  debrids: z.array(z.object({ name: z.string() })).nullish(),
});
const resultsSchema = z.array(z.object({ status: z.string().optional(), error: z.string().optional() }));

export async function addDownloads(form: HTMLFormElement): Promise<string> {
  const fields = new FormData(form);
  for (const [name, value] of [...fields]) {
    if (value instanceof File && value.size === 0) fields.delete(name);
  }
  const urls = String(fields.get('urls') ?? '').split('\n').filter((line) => line.trim());
  const nzbUrls = String(fields.get('nzbURLs') ?? '').split('\n').filter((line) => line.trim());
  const count = urls.length + nzbUrls.length + fields.getAll('files').length + fields.getAll('nzbFiles').length;
  if (count === 0 || count > 100) throw new Error('Provide between 1 and 100 torrents or NZBs.');

  for (const name of ['downloadUncached', 'rmTrackerUrls', 'skipMultiSeason']) fields.set(name, String(fields.has(name)));
  const results = resultsSchema.parse(await requestJson('api/add', { method: 'POST', body: fields }));
  const failures = results.filter((result) => result.status === 'error');
  const successes = results.length - failures.length;
  if (failures.length > 0) throw new Error(`Added ${successes} item(s). ${failures.length} failed:\n${failures.map((result) => result.error ?? 'Unknown error').join('\n')}`);

  return `Added ${successes} item(s) to the download queue.`;
}
