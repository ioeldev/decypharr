import { Badge } from '@/shared/components/ui/badge';
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
  if (version.isPending) return <Badge variant="secondary">Loading version…</Badge>;
  if (!version.data) return <Badge variant="secondary">Version unavailable</Badge>;
  return (
    <Badge asChild>
      <a
        href={`https://github.com/sirrobot01/decypharr/releases/tag/v${encodeURIComponent(version.data.version)}`}
      >
        {version.data.channel}-{version.data.version}
      </a>
    </Badge>
  );
}
