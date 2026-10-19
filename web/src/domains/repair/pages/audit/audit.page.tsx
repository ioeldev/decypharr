import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import PageHeader from '@/shared/components/page-header';
import RepairNavigation from '../../components/repair-navigation';
import RecoveryQueue from '../../components/recovery-queue';
import AuditStatus from './components/audit-status';
import RunControls from './components/run-controls';
import RunHistory from './components/run-history';
import BrokenEntries from './components/broken-entries';
import RepairMaintenance from './components/repair-maintenance';

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Repair"
        description="Check library health, repair entries, and track recovery."
        actions={<RunControls />}
      />
      <RepairNavigation />
      <AuditStatus />
      <RecoveryQueue />
      <Tabs defaultValue="broken" className="gap-4">
        <TabsList aria-label="Health check results">
          <TabsTrigger value="broken">Broken entries</TabsTrigger>
          <TabsTrigger value="history">Run history</TabsTrigger>
        </TabsList>
        <TabsContent value="broken">
          <BrokenEntries />
        </TabsContent>
        <TabsContent value="history">
          <RunHistory />
        </TabsContent>
      </Tabs>
      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
          Repair maintenance
        </summary>
        <div className="border-t">
          <RepairMaintenance />
        </div>
      </details>
    </div>
  );
}
