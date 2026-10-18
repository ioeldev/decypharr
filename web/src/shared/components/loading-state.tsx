import { Skeleton } from '@/shared/components/ui/skeleton';

export default function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3 py-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
