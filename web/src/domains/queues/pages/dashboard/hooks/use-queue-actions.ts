import { useState } from 'react';
import { deleteQueueEntries } from '../../../queues.api';

type ActionState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export function useQueueActions(onDeleted: (hashes: string[]) => void) {
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  function deleteEntries(hashes: string[], removeFromProvider: boolean): void {
    if (hashes.length === 0 || state.kind === 'pending') return;

    const action = removeFromProvider ? 'Remove from provider and delete' : 'Delete';
    if (!window.confirm(`${action} ${hashes.length} selected item(s)?`)) return;

    setState({ kind: 'pending' });
    deleteQueueEntries({ hashes, removeFromProvider })
      .then(() => {
        setState({ kind: 'success', message: `Deleted ${hashes.length} item(s).` });
        onDeleted(hashes);
      })
      .catch((error: unknown) => {
        setState({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to delete entries.' });
      });
  }

  function copyText(text: string): void {
    if (state.kind === 'pending') return;

    if (!navigator.clipboard) {
      setState({ kind: 'error', message: 'Clipboard access requires HTTPS or localhost.' });
      return;
    }

    setState({ kind: 'pending' });
    navigator.clipboard.writeText(text)
      .then(() => setState({ kind: 'success', message: 'Copied to clipboard.' }))
      .catch(() => setState({ kind: 'error', message: 'Unable to copy to the clipboard.' }));
  }

  return { state, deleteEntries, copyText };
}
