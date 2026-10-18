import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queuesKeys } from '../../../queues.queries';
import { libraryKeys } from '../../../../library/library.queries';
import { statisticsKeys } from '../../../../statistics/statistics.queries';
import { deleteQueueEntries } from '../../../queues.api';

type QueueAction = { kind: 'delete'; hashes: string[]; removeFromProvider: boolean } | { kind: 'copy'; text: string };

export function useQueueActions(onDeleted: (hashes: string[]) => void) {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: async (operation: QueueAction): Promise<string> => {
      if (operation.kind === 'copy') {
        if (!navigator.clipboard) throw new Error('Clipboard access requires HTTPS or localhost.');
        await navigator.clipboard.writeText(operation.text);
        return 'Copied to clipboard.';
      }

      await deleteQueueEntries(operation);
      return `Deleted ${operation.hashes.length} item(s).`;
    },
    onSuccess: (_message, operation) => {
      if (operation.kind === 'delete') onDeleted(operation.hashes);
    },
    onSettled: async (_message, _error, operation) => {
      if (operation.kind !== 'delete') return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queuesKeys.all }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
        queryClient.invalidateQueries({ queryKey: statisticsKeys.all }),
      ]);
    },
  });

  function deleteEntries(hashes: string[], removeFromProvider: boolean): void {
    if (hashes.length === 0 || action.isPending) return;
    const verb = removeFromProvider ? 'Remove from provider and delete' : 'Delete';
    if (!window.confirm(`${verb} ${hashes.length} selected item(s)?`)) return;

    action.mutate({ kind: 'delete', hashes, removeFromProvider });
  }

  return { action, deleteEntries, copyText: (text: string) => action.mutate({ kind: 'copy', text }) };
}
