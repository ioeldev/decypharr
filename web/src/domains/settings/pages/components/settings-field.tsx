import { arrayValue, objectValue, stringValue, type JsonValue } from '../../../../shared/api/json-response';
import type { SettingsField as Field } from '../../settings.types';
import SettingsObject from './settings-object';
import SettingsList from './settings-list';

export default function SettingsField({ field, value, onChange }: { field: Field; value: JsonValue | undefined; onChange: (value: JsonValue) => void }) {
  if (field.kind === 'object') return <fieldset className="border border-base-300 rounded-box p-4"><legend className="font-bold px-2">{field.label}</legend><SettingsObject fields={field.fields} value={objectValue(value)} onChange={onChange} /></fieldset>;
  if (field.kind === 'list') return <SettingsList field={field} value={arrayValue(value)} onChange={onChange} />;
  if (field.kind === 'boolean' && !field.isOptional) return <label className="fieldset"><span className="font-medium">{field.label}</span><input className="checkbox" type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />{field.description ? <span className="text-sm opacity-70">{field.description}</span> : null}</label>;

  return <label className="fieldset gap-2">
    <span className="font-medium">{field.label}</span>
    {field.kind === 'boolean' ? <select className="select w-full" value={value === undefined || value === null ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value === 'true')}><option value="">Use default</option><option value="true">Enabled</option><option value="false">Disabled</option></select> : null}
    {field.kind === 'choice' ? <select className="select w-full" value={stringValue(value)} onChange={(event) => onChange(event.target.value)}>
      <option value="">Default / None</option>{field.options.filter(Boolean).map((option) => <option key={option}>{option}</option>)}
      {value && !field.options.includes(stringValue(value)) ? <option value={stringValue(value)}>{stringValue(value)}</option> : null}
    </select> : null}
    {field.kind === 'number' ? <input className="input w-full" type="number" step="any" value={typeof value === 'number' ? value : ''} onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))} /> : null}
    {field.kind === 'text' ? <input className="input w-full" type={field.isSecret ? 'password' : 'text'} autoComplete="off" value={stringValue(value)} onChange={(event) => onChange(event.target.value)} /> : null}
    {field.description ? <span className="text-sm opacity-70">{field.description}</span> : null}
  </label>;
}
