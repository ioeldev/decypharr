import { z } from 'zod';
import { appUrl } from '../../shared/api/client';

export const browseEntrySchema = z.object({
  name: z.string(), path: z.string(), size: z.number(), mod_time: z.string(), is_dir: z.boolean(),
  info_hash: z.string().optional(), can_delete: z.boolean().optional(),
  active_debrid: z.string().optional(), kind: z.string().optional(),
});
export type BrowseEntry = z.infer<typeof browseEntrySchema>;
export const browseSchema = z.object({
  entries: z.array(browseEntrySchema).nullable().transform((entries) => entries ?? []),
  total: z.number(), total_pages: z.number(), parent_dir: z.string().optional(), current_kind: z.string().optional(),
});
export const healthSchema = z.object({ status: z.string().optional(), last_checked_at: z.string().optional(), failure_reason: z.string().optional() });

export function downloadUrl(entry: BrowseEntry): string {
  const parts = entry.path.split('/').filter(Boolean);
  return appUrl(`api/browse/download/${encodeURIComponent(parts.at(-2) ?? '')}/${encodeURIComponent(parts.at(-1) ?? '')}`);
}
