import { useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '@/shared/api/client';
import { stringValue, type JsonObject } from '@/shared/api/json-response';
import { DropdownMenuItem } from '@/shared/components/ui/dropdown-menu';
import RowActions from '@/shared/components/row-actions';
import ActionMessage from '@/shared/components/action-message';
import RepairListRow from '../../../components/repair-list-row';
import RepairStatus from '../../../components/repair-status';
import RepairDiagnostics from '../../../components/repair-diagnostics';
import { repairKeys } from '../../../repair.queries';

export default function BrokenEntry({ entry }: { entry: JsonObject }) {
  const queryClient = useQueryClient();
  const name = stringValue(entry.entry_name);
  const label = stringValue(entry.display_name) || name;
  const action = useMutation({
    mutationFn: async (operation: 'recheck' | 'repair'): Promise<string> => {
      if (operation === 'recheck') {
        await request(`api/repair/health/${encodeURIComponent(name)}/check`, { method: 'POST' });
        return 'Recheck requested.';
      }

      await request('api/repair/fix', { method: 'POST', json: { names: [entry.entry_name] } });
      return 'Repair requested.';
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });

  return (
    <RepairListRow
      label={label}
      title={
        <h3 className="truncate" title={label}>
          {label}
        </h3>
      }
      description={stringValue(entry.failure_reason) || 'Read validation failed'}
      status={<RepairStatus status="broken" />}
      actions={
        <RowActions label={label} disabled={action.isPending}>
          <DropdownMenuItem onSelect={() => action.mutate('recheck')}>Recheck</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (confirm('Queue a replacement for this entry?')) action.mutate('repair');
            }}
          >
            Repair
          </DropdownMenuItem>
        </RowActions>
      }
      feedback={<ActionMessage state={action} />}
    >
      <p className="break-words">{stringValue(entry.failure_reason) || 'Read validation failed'}</p>
      <p className="text-xs text-muted-foreground">
        Last checked: {stringValue(entry.last_checked_at) || '—'}
      </p>
      <RepairDiagnostics value={entry} />
    </RepairListRow>
  );
}
