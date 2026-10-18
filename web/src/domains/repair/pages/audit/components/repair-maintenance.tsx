import { request } from '../../../../../shared/api/client';
import { useAction } from '../../../../../shared/hooks/use-action';
import FormField from '../../../../../shared/components/form-field';
import ActionMessage from '../../../../../shared/components/action-message';
import { healthStates } from '../../../repair.api';

export default function RepairMaintenance() {
  const action = useAction();
  return <section className="card bg-base-100 p-5 space-y-5">
    <h2 className="text-xl">Recheck Arr Media</h2>
    <form className="flex gap-4 items-end" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      action.run(async () => { await request('api/repair/recheck/media', { method: 'POST', json: { arr: fields.get('arr'), media_id: fields.get('media_id'), fix: fields.has('fix') } }); return 'Media recheck requested.'; });
    }}>
      <FormField name="arr" label="Arr name" required /><FormField name="media_id" label="Media ID" required />
      <FormField name="fix" label="Repair broken files" type="checkbox" />
      <button className="btn" disabled={action.isPending}>Recheck</button>
    </form>
    <h2 className="text-xl">Clear Health State</h2>
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      const statuses = new FormData(event.currentTarget).getAll('status');
      if (!confirm('Clear the selected health states?')) return;
      action.run(async () => {
        if (statuses.length === 0) throw new Error('Select at least one health state.');
        await request('api/repair/clear-state', { method: 'POST', json: { statuses } });
        return 'Health states cleared.';
      });
    }}>
      <div className="flex gap-4">{healthStates.map((status) => <FormField key={status} label={status} type="checkbox" name="status" value={status} />)}</div>
      <button className="btn btn-warning" disabled={action.isPending}>Clear Selected States</button>
    </form>
    <ActionMessage state={action.state} />
  </section>;
}
