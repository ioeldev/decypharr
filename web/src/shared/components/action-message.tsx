import type { UseMutationResult } from '@tanstack/react-query';

type ActionResult = Pick<UseMutationResult<string, Error, unknown>, 'status' | 'data' | 'error'>;

export default function ActionMessage({ state }: { state: ActionResult }) {
  if (state.status === 'idle') return null;
  if (state.status === 'pending') return <p role="status">Working…</p>;
  if (state.status === 'error') return <p role="alert" className="alert alert-error whitespace-pre-wrap">{state.error?.message}</p>;

  return <p role="status" className="alert alert-success whitespace-pre-wrap">{state.data}</p>;
}
