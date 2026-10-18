import { useEffect, useState } from 'react';
import { requestJson } from '../../shared/api/client';

type VersionState =
  | { kind: 'loading' }
  | { kind: 'ready'; version: string; channel: string }
  | { kind: 'error' };

export default function VersionBadge() {
  const [state, setState] = useState<VersionState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    requestJson('version', { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (typeof response !== 'object' || response === null
          || !('version' in response) || typeof response.version !== 'string'
          || !('channel' in response) || typeof response.channel !== 'string') {
          throw new Error('Invalid version response.');
        }

        setState({ kind: 'ready', version: response.version, channel: response.channel });
      })
      .catch(() => {
        if (controller.signal.aborted) return;

        setState({ kind: 'error' });
      });

    return () => controller.abort();
  }, []);

  if (state.kind === 'loading') return <span className="badge">Loading version…</span>;
  if (state.kind === 'error') return <span className="badge">Version unavailable</span>;

  return <a className="badge badge-primary" href={`https://github.com/sirrobot01/decypharr/releases/tag/v${encodeURIComponent(state.version)}`}>
    {state.channel}-{state.version}
  </a>;
}
