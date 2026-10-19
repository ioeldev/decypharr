import { FieldGroup } from '@/shared/components/ui/field';
import type { JsonObject } from '../../../../shared/api/json-response';
import type { SettingsField as SettingsFieldDefinition } from '../../settings.types';
import SettingsField from './settings-field';

export default function SettingsObject({
  fields,
  value,
  onChange,
}: {
  fields: SettingsFieldDefinition[];
  value: JsonObject;
  onChange: (value: JsonObject) => void;
}) {
  return (
    <FieldGroup className="grid grid-cols-1 items-center gap-3 md:grid-cols-2">
      {fields.map((field) => (
        <div
          key={field.name}
          className={field.kind === 'object' || field.kind === 'list' ? 'md:col-span-2' : ''}
        >
          <SettingsField
            field={field}
            value={value[field.name]}
            onChange={(nextValue) => onChange({ ...value, [field.name]: nextValue })}
          />
        </div>
      ))}
    </FieldGroup>
  );
}
