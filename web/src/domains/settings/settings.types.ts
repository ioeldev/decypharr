interface FieldLabel {
  name: string;
  label: string;
  description?: string;
}

export type SettingsField = FieldLabel & (
  | { kind: 'text'; isSecret?: boolean }
  | { kind: 'number' }
  | { kind: 'boolean'; isOptional?: boolean }
  | { kind: 'choice'; options: string[] }
  | { kind: 'object'; fields: SettingsField[] }
  | { kind: 'list'; item: SettingsField }
);
