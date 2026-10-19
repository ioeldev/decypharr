import { useContext } from 'react';
import {
  SettingsDisplayContext,
  isCommonSetting,
  isRelevantSetting,
} from '../../settings-visibility';
import { FieldGroup } from '@/shared/components/ui/field';
import type { JsonObject } from '../../../../shared/api/json-response';
import type { SettingsField as SettingsFieldDefinition } from '../../settings.types';
import SettingsField from './settings-field';

export default function SettingsObject({
  fields,
  path = '',
  value,
  onChange,
}: {
  fields: SettingsFieldDefinition[];
  path?: string;
  value: JsonObject;
  onChange: (value: JsonObject) => void;
}) {
  const { configuration, showAdvanced } = useContext(SettingsDisplayContext);
  const visibleFields = fields.filter(
    (field) =>
      (showAdvanced || isCommonSetting(path, field.name)) &&
      isRelevantSetting({ path, name: field.name, value, configuration }),
  );

  return (
    <FieldGroup className="grid grid-cols-1 items-center gap-3 md:grid-cols-2">
      {visibleFields.map((field) => (
        <div
          key={field.name}
          className={field.kind === 'object' || field.kind === 'list' ? 'md:col-span-2' : ''}
        >
          <SettingsField
            field={field}
            path={path ? `${path}.${field.name}` : field.name}
            value={value[field.name]}
            onChange={(nextValue) => onChange({ ...value, [field.name]: nextValue })}
          />
        </div>
      ))}
    </FieldGroup>
  );
}
