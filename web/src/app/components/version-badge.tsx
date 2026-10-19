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
  const versionLabel = `${version.data.channel}-${version.data.version}`;
  const shortenedLabel = versionLabel.length > 22
    ? `${versionLabel.slice(0, 10)}...${versionLabel.slice(-9)}`
    : versionLabel;

  return (
    <Badge asChild className="min-w-0 max-w-full overflow-hidden">
      <a
        title={versionLabel}
        aria-label={versionLabel}
        href={`https://github.com/sirrobot01/decypharr/releases/tag/v${encodeURIComponent(version.data.version)}`}
      >
        {shortenedLabel}
      </a>
    </Badge>
  );
}
