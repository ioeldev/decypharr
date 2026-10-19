import { useState } from 'react';
import type { JsonValue } from '@/shared/api/json-response';
import RecordDetails from '@/shared/components/record-details';

export default function RepairDiagnostics({ value }: { value: JsonValue }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-xs text-muted-foreground">Technical details</summary>
      {isOpen ? (
        <div className="mt-2 min-w-0">
          <RecordDetails value={value} />
        </div>
      ) : null}
    </details>
  );
}
