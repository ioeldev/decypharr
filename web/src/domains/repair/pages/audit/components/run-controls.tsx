import { repairKeys, repairConfigQuery } from '../../../repair.queries';
import { request } from '../../../../../shared/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FormField from '../../../../../shared/components/form-field';
import ActionMessage from '../../../../../shared/components/action-message';

export default function RunControls() {
  const config = useQuery(repairConfigQuery());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  if (config.isPending) return <p>Loading repair configuration…</p>;
  if (config.isError && !config.data) return <p role="alert">{config.error.message}</p>;

  const settings = config.data;
  return <section className="card bg-base-100 p-5 space-y-4">
    <h2 className="text-xl">Run a health check</h2>
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      action.mutate(async () => {
        await request('api/repair/run', { method: 'POST', json: {
          library_audit: fields.has('library_audit'), ignore_last_checked: fields.has('ignore_last_checked'),
          auto_repair: fields.has('auto_repair'), unrestrict_link: true,
          verify_content: fields.has('verify_content'), protocol: fields.get('protocol'),
        } });
        return 'Health check started.';
      });
    }}>
      <div className="flex gap-5">
        <FormField label="Audit imported library files" type="checkbox" name="library_audit" defaultChecked={Boolean(settings.library_audit)} />
        <FormField label="Include recently checked entries" type="checkbox" name="ignore_last_checked" />
        <FormField label="Automatically repair" type="checkbox" name="auto_repair" defaultChecked={Boolean(settings.auto_repair)} />
        <FormField label="Verify NZB content" type="checkbox" name="verify_content" defaultChecked={Boolean(settings.verify_content)} />
        <label className="fieldset">Protocol<select name="protocol" className="select"><option value="all">All</option><option value="torrent">Torrent</option><option value="nzb">Usenet</option></select></label>
      </div>
      <button className="btn btn-primary" disabled={action.isPending}>Run Now</button>
    </form>
    <div className="flex gap-3">
      <button className="btn" disabled={action.isPending} onClick={() => action.mutate(async () => { await request('api/repair/stop', { method: 'POST' }); return 'Stop requested.'; })}>Stop Run</button>
      <button className="btn btn-warning" disabled={action.isPending} onClick={() => {
        if (!confirm('Send delete and re-search requests for all broken entries to their Arr?')) return;
        action.mutate(async () => { await request('api/repair/fix', { method: 'POST', json: {} }); return 'Recovery submission started.'; });
      }}>Fix Broken Entries</button>
    </div>
    <ActionMessage state={action} />
  </section>;
}
