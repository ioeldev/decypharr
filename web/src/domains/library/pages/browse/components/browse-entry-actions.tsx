import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/components/ui/dropdown-menu';
import RowActions from '@/shared/components/row-actions';
import ActionMessage from '@/shared/components/action-message';
import { request } from '@/shared/api/client';
import { downloadUrl, type BrowseEntry } from '../../../library.api';

type BrowseEntryActionsProps = {
  entry: BrowseEntry;
  isDeleting: boolean;
  onDelete: () => void;
  onOpenDirectory: () => void;
};

export default function BrowseEntryActions({
  entry,
  isDeleting,
  onDelete,
  onOpenDirectory,
}: BrowseEntryActionsProps) {
  const queryClient = useQueryClient();
  const recheck = useMutation({
    mutationFn: async (): Promise<string> => {
      await request(`api/repair/health/${encodeURIComponent(entry.name)}/check`, {
        method: 'POST',
      });
      return 'Recheck requested.';
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['repair', 'health'] }),
  });

  return (
    <div className="flex max-w-52 flex-col items-end whitespace-normal">
      <RowActions label={entry.name} disabled={isDeleting || recheck.isPending}>
        {entry.is_dir ? (
          <DropdownMenuItem onSelect={onOpenDirectory}>Open folder</DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <a href={downloadUrl(entry)}>Download file</a>
          </DropdownMenuItem>
        )}
        {entry.kind === 'entry' ? (
          <DropdownMenuItem onSelect={() => recheck.mutate()}>Recheck health</DropdownMenuItem>
        ) : null}
        {entry.can_delete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </RowActions>
      <ActionMessage state={recheck} />
    </div>
  );
}
