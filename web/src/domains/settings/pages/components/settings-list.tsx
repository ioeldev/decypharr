import { objectValue, stringValue, type JsonValue } from '../../../../shared/api/json-response';
import type { SettingsField as Field } from '../../settings.types';
import SettingsField from './settings-field';

export default function SettingsList({ field, value, onChange }: { field: Extract<Field, { kind: 'list' }>; value: JsonValue[]; onChange: (value: JsonValue[]) => void }) {
  function newItem(): JsonValue {
    if (field.item.kind === 'object') return {};
    if (field.item.kind === 'list') return [];
    if (field.item.kind === 'number') return 0;
    if (field.item.kind === 'boolean') return false;
    return '';
  }

  return <fieldset className="space-y-3 border border-base-300 rounded-box p-4">
    <legend className="font-bold px-2">{field.label}</legend>
    {value.map((entry, index) => <div key={index} className="space-y-2 bg-base-200 rounded-box p-3">
      <div className="flex justify-between items-center"><span>{stringValue(objectValue(entry).name) || stringValue(objectValue(entry).host) || `${field.label} ${index + 1}`}</span>
        <div className="flex gap-2"><button type="button" className="btn btn-xs" disabled={index === 0} onClick={() => {
          const next = [...value];
          const previous = next[index - 1];
          if (previous === undefined) return;
          next[index - 1] = entry; next[index] = previous; onChange(next);
        }}>Move Up</button><button type="button" className="btn btn-xs btn-error" onClick={() => onChange(value.filter((_, position) => position !== index))}>Remove</button></div>
      </div>
      <SettingsField field={field.item} value={entry} onChange={(nextValue) => onChange(value.map((current, position) => position === index ? nextValue : current))} />
    </div>)}
    <button type="button" className="btn btn-sm" onClick={() => onChange([...value, newItem()])}>Add {field.label}</button>
  </fieldset>;
}
