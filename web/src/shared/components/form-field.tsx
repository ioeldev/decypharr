import type { InputHTMLAttributes } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string };

export default function FormField({ label, description, ...input }: FieldProps) {
  const isCheckbox = input.type === 'checkbox';

  return <label className="fieldset gap-2">
    <span className="font-medium">{label}</span>
    <input className={isCheckbox ? 'checkbox' : 'input w-full'} {...input} />
    {description ? <span className="text-sm opacity-70">{description}</span> : null}
  </label>;
}
