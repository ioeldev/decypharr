import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible';

type RepairListRowProps = {
  label: string;
  title: ReactNode;
  description?: ReactNode;
  status: ReactNode;
  actions?: ReactNode;
  selection?: ReactNode;
  feedback?: ReactNode;
  children: ReactNode;
};

export default function RepairListRow({
  label,
  title,
  description,
  status,
  actions,
  selection,
  feedback,
  children,
}: RepairListRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} asChild>
      <article className="min-w-0 border-b last:border-b-0">
        <div className="flex min-w-0 items-center gap-2 px-2 py-2.5 sm:px-3">
          {selection}
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Details for ${label}`}
              className="group/expand"
            >
              <ChevronRight className="transition-transform group-data-[state=open]/expand:rotate-90" />
            </Button>
          </CollapsibleTrigger>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="min-w-0 text-sm font-medium">{title}</div>
            {description ? (
              <div className="truncate text-xs text-muted-foreground">{description}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {status}
            {actions}
          </div>
        </div>
        <CollapsibleContent className="px-3 pb-3 sm:pl-12">
          {isExpanded ? (
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              {children}
            </div>
          ) : null}
        </CollapsibleContent>
        {feedback}
      </article>
    </Collapsible>
  );
}
