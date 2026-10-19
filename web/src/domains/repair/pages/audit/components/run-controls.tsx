import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/components/ui/sheet';
import HealthCheckForm from './health-check-form';

export default function RunControls() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button>
          <ScanLine data-icon="inline-start" />
          Run a health check
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Run a health check</SheetTitle>
          <SheetDescription>
            Choose what to check. Follow the run’s progress on the repair page.
          </SheetDescription>
        </SheetHeader>
        <HealthCheckForm onStarted={() => setIsOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
