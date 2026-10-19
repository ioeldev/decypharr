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

export default function VirtualFolderPreview({ folder }: { folder: JsonObject }) {
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
  });
  const [preview, setPreview] = useState<JsonObject | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        disabled={action.isPending}
        onClick={() =>
          action.mutate(async () => {
            const response = jsonObjectSchema.parse(
              await requestJson('api/virtual-folders/preview', {
                method: 'POST',
                json: { folder, limit: 10 },
              }),
            );
            setPreview(response);
            return 'Preview updated. Changes have not been saved.';
          })
        }
        variant="secondary"
        size="sm"
      >
        Preview {stringValue(folder.name) || 'Virtual Folder'}
      </Button>
      <ActionMessage state={action} />
      {preview ? <RecordDetails value={preview} /> : null}
    </div>
  );
}
