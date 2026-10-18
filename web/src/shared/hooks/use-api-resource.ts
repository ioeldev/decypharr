import { useEffect, useState } from 'react';
import { requestJson } from '../api/client';

export type ResourceState<Value> =
  | { kind: 'loading' }
  | { kind: 'ready'; value: Value; warning?: string }
  | { kind: 'error'; message: string };

export function useApiResource<Value>(options: {
  path: string;
  parse: (response: unknown) => Value;
  pollIntervalMs?: number;
}) {
  const { path, parse, pollIntervalMs } = options;
  const [state, setState] = useState<ResourceState<Value>>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setState({ kind: 'loading' });

    function load(): void {
      requestJson(path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
        .then(parse)
        .then((value) => {
          if (controller.signal.aborted) return;

          setState({ kind: 'ready', value });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;

          const message = error instanceof Error ? error.message : 'Unable to load this page.';
          setState((previous) => previous.kind === 'ready'
            ? { ...previous, warning: `${message} Showing the last response; retrying automatically.` }
            : { kind: 'error', message });
        })
        .finally(() => {
          if (controller.signal.aborted || !pollIntervalMs) return;

          timeout = setTimeout(load, pollIntervalMs);
        });
    }

    load();
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [path, parse, pollIntervalMs, revision]);

  return { state, reload: () => setRevision((previous) => previous + 1) };
}
