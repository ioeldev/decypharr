import { appUrl } from '../../../../../shared/api/client';
import type { JsonObject } from '../../../../../shared/api/json-response';
import { recoveryMedia } from '../recovery-media';
import { useQuery } from '@tanstack/react-query';
import { recoveryMediaQuery } from '../recovery-media.queries';

export default function RecoveryMediaLabel({ binding }: { binding: JsonObject }) {
  const details = useQuery(recoveryMediaQuery(binding));
  const media = recoveryMedia(binding, details.data);
  return (
    <div className="min-w-0">
      <div className="truncate font-medium" title={media.label}>
        {media.path ? (
          <a
            href={appUrl(media.path)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {media.label} ↗
          </a>
        ) : (
          media.label
        )}
      </div>
    </div>
  );
}
