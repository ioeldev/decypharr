import { useId, type InputHTMLAttributes } from 'react';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/shared/components/ui/field';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
  onCheckedChange?: (isChecked: boolean) => void;
};

export default function FormField({ label, description, onCheckedChange, ...input }: FieldProps) {
  const generatedId = useId();
  const id = input.id ?? generatedId;
  const isCheckbox = input.type === 'checkbox';

  return (
    <Field orientation={isCheckbox ? 'horizontal' : 'vertical'} data-disabled={input.disabled}>
      {isCheckbox ? (
        <Checkbox
          id={id}
          name={input.name}
          value={input.value}
          checked={input.checked}
          defaultChecked={input.defaultChecked}
          disabled={input.disabled}
          required={input.required}
          aria-describedby={description ? `${id}-description` : undefined}
          onCheckedChange={(checked) => onCheckedChange?.(checked === true)}
        />
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {isCheckbox ? null : (
          <Input
            {...input}
            id={id}
            aria-describedby={description ? `${id}-description` : undefined}
          />
        )}
        {description ? (
          <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
        ) : null}
      </div>
    </Field>
  );
}
