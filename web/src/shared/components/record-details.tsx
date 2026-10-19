import type { JsonValue } from '../api/json-response';

export default function RecordDetails({ value }: { value: JsonValue }) {
  if (value === null) return <span>—</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value !== 'object') return <span className="break-all">{String(value)}</span>;
  if (Array.isArray(value))
    return (
      <ul className="flex flex-col gap-2">
        {value.map((entry, index) => (
          <li key={index}>
            <RecordDetails value={entry} />
          </li>
        ))}
      </ul>
    );
  return (
    <dl className="flex flex-col gap-2">
      {Object.entries(value).map(([name, entry]) => (
        <div
          key={name}
          className="grid grid-cols-1 sm:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)] gap-3 border-b border-border py-1"
        >
          <dt className="font-medium">
            {name.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')}
          </dt>
          <dd className="min-w-0 break-words">
            <RecordDetails value={entry} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
