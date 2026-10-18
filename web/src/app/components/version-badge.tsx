import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '../../shared/api/client';

const versionSchema = z.object({ version: z.string(), channel: z.string() });

export default function VersionBadge() {
  const version = useQuery({
    queryKey: ['version'],
    queryFn: ({ signal }) => requestJson('version', { signal }).then(versionSchema.parse),
    staleTime: Infinity,
  });
  if (version.isPending) return <span className="badge">Loading version…</span>;
  if (!version.data) return <span className="badge">Version unavailable</span>;

  return <a className="badge badge-primary" href={`https://github.com/sirrobot01/decypharr/releases/tag/v${encodeURIComponent(version.data.version)}`}>
    {version.data.channel}-{version.data.version}
  </a>;
}
