import RepairNavigation from '../../components/repair-navigation';
import RecoveryQueue from '../../components/recovery-queue';
import AuditStatus from './components/audit-status';
import RunControls from './components/run-controls';
import RunHistory from './components/run-history';
import BrokenEntries from './components/broken-entries';
import RepairMaintenance from './components/repair-maintenance';

export default function AuditPage() {
  return <div className="space-y-6"><h1 className="text-2xl font-bold">Repair</h1><RepairNavigation />
    <AuditStatus /><RunControls /><RecoveryQueue /><BrokenEntries /><RunHistory /><RepairMaintenance />
  </div>;
}
