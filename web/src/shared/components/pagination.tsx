import { Button } from '@/shared/components/ui/button';

export default function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={page <= 1} onClick={() => onChange(page - 1)} variant="secondary" size="sm">
        Previous
      </Button>
      <span className="px-2 text-sm text-muted-foreground tabular-nums">
        {page} / {totalPages}
      </span>
      <Button
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        variant="secondary"
        size="sm"
      >
        Next
      </Button>
    </div>
  );
}
