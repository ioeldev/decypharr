import { useId } from 'react';
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from '@/shared/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/shared/components/ui/native-select';
import { Input } from '@/shared/components/ui/input';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { arrayValue, objectValue, stringValue, type JsonValue } from '@/shared/api/json-response';
import type { SettingsField as SettingsFieldDefinition } from '../../settings.types';
import SettingsObject from './settings-object';
import SettingsList from './settings-list';

type SettingsFieldProps = {
  field: SettingsFieldDefinition;
  path?: string;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
};

export default function SettingsField({
  field,
  value,
  onChange,
  path = field.name,
}: SettingsFieldProps) {
  const id = useId();
  const descriptionId = field.description ? `${id}-description` : undefined;

  if (field.kind === 'object')
    return (
      <FieldSet className="rounded-xl border p-4">
        <FieldLegend>{field.label}</FieldLegend>
        <SettingsObject
          path={path}
          fields={field.fields}
          value={objectValue(value)}
          onChange={onChange}
        />
      </FieldSet>
    );

  if (field.kind === 'list')
    return <SettingsList path={path} field={field} value={arrayValue(value)} onChange={onChange} />;

  if (field.kind === 'boolean' && !field.isOptional)
    return (
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={Boolean(value)}
          onCheckedChange={(isChecked) => onChange(isChecked === true)}
          aria-describedby={descriptionId}
        />
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
          {field.description ? (
            <FieldDescription id={descriptionId}>{field.description}</FieldDescription>
          ) : null}
        </div>
      </Field>
    );

  return (
    <Field>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      {field.kind === 'boolean' ? (
        <NativeSelect
          id={id}
          className="w-full"
          aria-describedby={descriptionId}
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : event.target.value === 'true')
          }
        >
          <NativeSelectOption value="">Use default</NativeSelectOption>
          <NativeSelectOption value="true">Enabled</NativeSelectOption>
          <NativeSelectOption value="false">Disabled</NativeSelectOption>
        </NativeSelect>
      ) : null}
      {field.kind === 'choice' ? (
        <NativeSelect
          id={id}
          className="w-full"
          aria-describedby={descriptionId}
          value={stringValue(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          <NativeSelectOption value="">Default / None</NativeSelectOption>
          {field.options.filter(Boolean).map((option) => (
            <NativeSelectOption key={option}>{option}</NativeSelectOption>
          ))}
          {value && !field.options.includes(stringValue(value)) ? (
            <NativeSelectOption value={stringValue(value)}>{stringValue(value)}</NativeSelectOption>
          ) : null}
        </NativeSelect>
      ) : null}
      {field.kind === 'number' ? (
        <Input
          id={id}
          aria-describedby={descriptionId}
          type="number"
          step="any"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
        />
      ) : null}
      {field.kind === 'text' ? (
        <Input
          id={id}
          aria-describedby={descriptionId}
          type={field.isSecret ? 'password' : 'text'}
          autoComplete="off"
          value={stringValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
      {field.description ? (
        <FieldDescription id={descriptionId}>{field.description}</FieldDescription>
      ) : null}
    </Field>
  );
}
