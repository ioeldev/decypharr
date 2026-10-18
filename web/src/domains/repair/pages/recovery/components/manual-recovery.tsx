import { repairKeys, bindingsQuery } from '../../../repair.queries';
import { useState } from 'react';
import { request } from '../../../../../shared/api/client';
import { stringValue, numberValue, type JsonObject } from '../../../../../shared/api/json-response';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FormField from '../../../../../shared/components/form-field';
import ActionMessage from '../../../../../shared/components/action-message';

export default function ManualRecovery() {
  const [query, setQuery] = useState('');
  const [arr, setArr] = useState('');
  const [selected, setSelected] = useState<JsonObject | null>(null);
  const bindings = useQuery(bindingsQuery(query, arr));
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });

  return <section className="card bg-base-100 p-5 space-y-4">
    <h2 className="text-xl">Request Replacement</h2>
    <div className="flex gap-3"><FormField label="Search indexed files" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} /><FormField label="Arr name (optional)" value={arr} onChange={(event) => { setArr(event.target.value); setSelected(null); }} /></div>
    {bindings.isPending ? <p>Searching…</p> : null}
    {(bindings.isError && !bindings.data) ? <p role="alert">{bindings.error.message}</p> : null}
    {bindings.data !== undefined ? <div className="max-h-80 overflow-auto">{bindings.data.length === 0 ? <p>No indexed file matches.</p> : bindings.data.map((binding, index) => <label className="flex gap-3 border-b border-base-300 p-2" key={index}>
      <input type="radio" name="binding" className="radio" disabled={numberValue(binding.arrFileId) <= 0} checked={selected === binding} onChange={() => setSelected(binding)} />
      <span>{stringValue(binding.entryFileName) || stringValue(binding.entryFileId)} · {stringValue(binding.arrName)}<small className="block">{stringValue(binding.entryName)}</small></span>
    </label>)}</div> : null}
    <form className="flex gap-3" onSubmit={(event) => {
      event.preventDefault();
      if (!selected) return;
      const strategy = new FormData(event.currentTarget).get('strategy');
      action.mutate(async () => {
        await request('api/arr/reacquire', { method: 'POST', json: { entryId: selected.entryId, fileId: selected.entryFileId, cause: 'manual', strategy } });
        setSelected(null);
        return 'Replacement queued.';
      });
    }}>
      <select className="select" name="strategy" aria-label="Replacement strategy"><option value="history_failed">Mark history failed</option><option value="interactive_best">Best interactive result</option><option value="command_search">Arr search</option><option value="season_pack_first">Season pack first</option></select>
      <button className="btn btn-primary" disabled={!selected || action.isPending}>Queue Replacement</button>
    </form>
    <ActionMessage state={action} />
  </section>;
}
