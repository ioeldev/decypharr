import { appUrl } from '../../../../../shared/api/client';
import type { JsonObject } from '../../../../../shared/api/json-response';
import { recoveryMedia } from '../recovery-media';
import { useRecoveryMedia } from '../hooks/use-recovery-media';

export default function RecoveryMediaLabel({ binding }: { binding: JsonObject }) {
  const details = useRecoveryMedia(binding);
  const media = recoveryMedia(binding, details);
  return <div>
    <div className="font-bold">{media.path ? <a className="link link-hover" href={appUrl(media.path)} target="_blank" rel="noopener noreferrer">{media.label} ↗</a> : media.label}</div>
    <p className="text-xs opacity-60 break-all">{media.filename}</p>
  </div>;
}
