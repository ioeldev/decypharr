import type { JsonObject } from '../../../../shared/api/json-response';
import type { SettingsField as Field } from '../../settings.types';
import SettingsField from './settings-field';

export default function SettingsObject({ fields, value, onChange }: { fields: Field[]; value: JsonObject; onChange: (value: JsonObject) => void }) {
  return <div className="grid grid-cols-2 gap-4">
    {fields.map((field) => <div key={field.name} className={field.kind === 'object' || field.kind === 'list' ? 'col-span-2' : ''}>
      <SettingsField field={field} value={value[field.name]} onChange={(nextValue) => onChange({ ...value, [field.name]: nextValue })} />
    </div>)}
  </div>;
}
