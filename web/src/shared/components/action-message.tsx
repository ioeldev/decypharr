import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import type { UseMutationResult } from '@tanstack/react-query';

type ActionResult = Pick<UseMutationResult<string, Error, unknown>, 'status' | 'data' | 'error'>;
export default function ActionMessage({ state }: { state: ActionResult }) {
  if (state.status === 'idle') return null;
  if (state.status === 'pending') return <p role="status">Working…</p>;
  if (state.status === 'error')
    return (
      <Alert role="alert" variant="destructive">
        <AlertDescription>{state.error?.message}</AlertDescription>
      </Alert>
    );
  return (
    <Alert role="status" variant="default">
      <AlertDescription>{state.data}</AlertDescription>
    </Alert>
  );
}
