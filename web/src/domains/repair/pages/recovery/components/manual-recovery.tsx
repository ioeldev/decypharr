import { Empty, EmptyHeader, EmptyTitle } from '@/shared/components/ui/empty';
import { FieldGroup } from '@/shared/components/ui/field';
import { NativeSelectOption, NativeSelect } from '@/shared/components/ui/native-select';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
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
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl">Request Replacement</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="flex gap-3 flex-wrap">
          <FormField
            label="Search indexed files"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
          />
          <FormField
            label="Arr name (optional)"
            value={arr}
            onChange={(event) => {
              setArr(event.target.value);
              setSelected(null);
            }}
          />
        </div>
        {bindings.isPending ? <p>Searching…</p> : null}
        {bindings.isError && !bindings.data ? <p role="alert">{bindings.error.message}</p> : null}
        {bindings.data !== undefined ? (
          <div className="max-h-80 overflow-auto">
            {bindings.data.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No indexed file matches.</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              bindings.data.map((binding, index) => (
                <label key={index} className="flex gap-3 border-b border-border p-2 flex-wrap">
                  <input
                    type="radio"
                    name="binding"
                    disabled={numberValue(binding.arrFileId) <= 0}
                    checked={selected === binding}
                    onChange={() => setSelected(binding)}
                    className="accent-primary size-4"
                  />
                  <span>
                    {stringValue(binding.entryFileName) || stringValue(binding.entryFileId)} ·{' '}
                    {stringValue(binding.arrName)}
                    <small className="block">{stringValue(binding.entryName)}</small>
                  </span>
                </label>
              ))
            )}
          </div>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected) return;
            const strategy = new FormData(event.currentTarget).get('strategy');
            action.mutate(async () => {
              await request('api/arr/reacquire', {
                method: 'POST',
                json: {
                  entryId: selected.entryId,
                  fileId: selected.entryFileId,
                  cause: 'manual',
                  strategy,
                },
              });
              setSelected(null);
              return 'Replacement queued.';
            });
          }}
          className="flex gap-3 flex-wrap"
        >
          <FieldGroup>
            <NativeSelect name="strategy" aria-label="Replacement strategy">
              <NativeSelectOption value="history_failed">Mark history failed</NativeSelectOption>
              <NativeSelectOption value="interactive_best">
                Best interactive result
              </NativeSelectOption>
              <NativeSelectOption value="command_search">Arr search</NativeSelectOption>
              <NativeSelectOption value="season_pack_first">Season pack first</NativeSelectOption>
            </NativeSelect>
            <Button disabled={!selected || action.isPending} variant="default">
              Queue Replacement
            </Button>
          </FieldGroup>
        </form>
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
