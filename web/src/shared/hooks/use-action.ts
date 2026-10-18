import { useState } from 'react';

export type ActionState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export function useAction() {
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  function run(operation: () => Promise<string>): void {
    if (state.kind === 'pending') return;

    setState({ kind: 'pending' });
    operation()
      .then((message) => setState({ kind: 'success', message }))
      .catch((error: unknown) => {
        setState({ kind: 'error', message: error instanceof Error ? error.message : 'The operation failed.' });
      });
  }

  return { state, run, isPending: state.kind === 'pending' };
}
