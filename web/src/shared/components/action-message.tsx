import type { ActionState } from '../hooks/use-action';

export default function ActionMessage({ state }: { state: ActionState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'pending') return <p role="status">Working…</p>;
  if (state.kind === 'error') return <p role="alert" className="alert alert-error whitespace-pre-wrap">{state.message}</p>;

  return <p role="status" className="alert alert-success whitespace-pre-wrap">{state.message}</p>;
}
