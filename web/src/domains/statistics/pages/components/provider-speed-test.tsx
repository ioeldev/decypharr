import { Button } from '@/shared/components/ui/button';
import { useState } from 'react';
import { requestJson } from '../../../../shared/api/client';
import {
  jsonObjectSchema,
  stringValue,
  type JsonObject,
} from '../../../../shared/api/json-response';
import { useMutation } from '@tanstack/react-query';
import ActionMessage from '../../../../shared/components/action-message';
import RecordDetails from '../../../../shared/components/record-details';

export default function ProviderSpeedTest({
  provider,
  protocol,
}: {
  provider: string;
  protocol: 'nntp' | 'debrid';
}) {
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
  });
  const [result, setResult] = useState<JsonObject | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={action.isPending}
        onClick={() =>
          action.mutate(async () => {
            const response = jsonObjectSchema.parse(
              await requestJson('debug/speedtest', {
                method: 'POST',
                json: { protocol, provider },
              }),
            );
            if (response.error) throw new Error(stringValue(response.error));
            setResult(response);
            return 'Speed test completed.';
          })
        }
        variant="secondary"
        size="sm"
      >
        Test {provider}
      </Button>
      <ActionMessage state={action} />
      {result ? <RecordDetails value={result} /> : null}
    </div>
  );
}
