import { FieldLegend, FieldSet } from '@/shared/components/ui/field';
import { Button } from '@/shared/components/ui/button';
import { objectValue, stringValue, type JsonValue } from '../../../../shared/api/json-response';
import type { SettingsField as SettingsFieldDefinition } from '../../settings.types';
import SettingsField from './settings-field';

export default function SettingsList({
  field,
  path,
  value,
  onChange,
}: {
  field: Extract<
    SettingsFieldDefinition,
    {
      kind: 'list';
    }
  >;
  path: string;
  value: JsonValue[];
  onChange: (value: JsonValue[]) => void;
}) {
  function newItem(): JsonValue {
    if (field.item.kind === 'object') return {};
    if (field.item.kind === 'list') return [];
    if (field.item.kind === 'number') return 0;
    if (field.item.kind === 'boolean') return false;
    return '';
  }
  return (
    <FieldSet className="flex flex-col gap-3 border border-border rounded-xl p-4">
      <FieldLegend className="font-bold px-2">{field.label}</FieldLegend>
      {value.map((entry, index) => (
        <div key={index} className="flex flex-col gap-2 bg-muted/50 rounded-xl p-3">
          <div className="flex justify-between items-center flex-wrap">
            <span>
              {stringValue(objectValue(entry).name) ||
                stringValue(objectValue(entry).host) ||
                `${field.label} ${index + 1}`}
            </span>
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                disabled={index === 0}
                onClick={() => {
                  const next = [...value];
                  const previous = next[index - 1];
                  if (previous === undefined) return;
                  next[index - 1] = entry;
                  next[index] = previous;
                  onChange(next);
                }}
                variant="secondary"
                size="sm"
              >
                Move Up
              </Button>
              <Button
                type="button"
                onClick={() => onChange(value.filter((_, position) => position !== index))}
                variant="destructive"
                size="sm"
              >
                Remove
              </Button>
            </div>
          </div>
          <SettingsField
            field={field.item}
            path={path}
            value={entry}
            onChange={(nextValue) =>
              onChange(value.map((current, position) => (position === index ? nextValue : current)))
            }
          />
        </div>
      ))}
      <Button
        type="button"
        onClick={() => onChange([...value, newItem()])}
        variant="secondary"
        size="sm"
      >
        Add {field.label}
      </Button>
    </FieldSet>
  );
}
