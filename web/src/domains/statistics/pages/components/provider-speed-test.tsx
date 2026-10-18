import { useState } from 'react';
import { requestJson } from '../../../../shared/api/client';
import { jsonObjectSchema, stringValue, type JsonObject } from '../../../../shared/api/json-response';
import { useAction } from '../../../../shared/hooks/use-action';
import ActionMessage from '../../../../shared/components/action-message';
import RecordDetails from '../../../../shared/components/record-details';

export default function ProviderSpeedTest({ provider, protocol }: { provider: string; protocol: 'nntp' | 'debrid' }) {
  const action = useAction();
  const [result, setResult] = useState<JsonObject | null>(null);
  return <div className="space-y-2">
    <button className="btn btn-sm" disabled={action.isPending} onClick={() => action.run(async () => {
      const response = jsonObjectSchema.parse(await requestJson('debug/speedtest', { method: 'POST', json: { protocol, provider } }));
      if (response.error) throw new Error(stringValue(response.error));
      setResult(response);
      return 'Speed test completed.';
    })}>Test {provider}</button>
    <ActionMessage state={action.state} />
    {result ? <RecordDetails value={result} /> : null}
  </div>;
}
