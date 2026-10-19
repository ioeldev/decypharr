import { numberValue, objectValue, stringValue, type JsonObject } from '@/shared/api/json-response';
import RecordDetails from '@/shared/components/record-details';
import RepairListRow from '../../../components/repair-list-row';
import RepairStatus from '../../../components/repair-status';
import RepairDiagnostics from '../../../components/repair-diagnostics';

export default function RunHistoryRow({ run }: { run: JsonObject }) {
  const startedAt = stringValue(run.started_at);
  const source = stringValue(run.source).replaceAll('-', ' ').replaceAll(':', ' · ');
  const stats = objectValue(run.stats);
  const summary = Object.entries(stats)
    .filter(([, count]) => numberValue(count) > 0)
    .slice(0, 3)
    .map(([name, count]) => `${numberValue(count)} ${name.replaceAll('_', ' ')}`)
    .join(' · ');

  return (
    <RepairListRow
      label={`run ${stringValue(run.id) || startedAt}`}
      title={
        <h3 className="truncate" title={source}>
          {source || 'Health check'}
        </h3>
      }
      description={
        <>
          {startedAt}
          {summary ? ` · ${summary}` : ''}
        </>
      }
      status={<RepairStatus status={stringValue(run.status)} />}
    >
      <RecordDetails value={stats} />
      <RepairDiagnostics value={run} />
    </RepairListRow>
  );
}
