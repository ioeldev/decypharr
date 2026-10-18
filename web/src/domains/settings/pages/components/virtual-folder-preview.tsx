import { useState } from 'react';
import { requestJson } from '../../../../shared/api/client';
import { jsonObjectSchema, stringValue, type JsonObject } from '../../../../shared/api/json-response';
import { useAction } from '../../../../shared/hooks/use-action';
import ActionMessage from '../../../../shared/components/action-message';
import RecordDetails from '../../../../shared/components/record-details';

export default function VirtualFolderPreview({ folder }: { folder: JsonObject }) {
  const action = useAction();
  const [preview, setPreview] = useState<JsonObject | null>(null);
  return <div className="space-y-3">
    <button type="button" className="btn btn-sm" disabled={action.isPending} onClick={() => action.run(async () => {
      const response = jsonObjectSchema.parse(await requestJson('api/virtual-folders/preview', { method: 'POST', json: { folder, limit: 10 } }));
      setPreview(response);
      return 'Preview updated. Changes have not been saved.';
    })}>Preview {stringValue(folder.name) || 'Virtual Folder'}</button>
    <ActionMessage state={action.state} />
    {preview ? <RecordDetails value={preview} /> : null}
  </div>;
}
