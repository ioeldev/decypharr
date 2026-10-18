import { sessionQuery } from '../auth.queries';
import { appUrl, request } from '../../../shared/api/client';
import { useQuery, useMutation } from '@tanstack/react-query';
import ActionMessage from '../../../shared/components/action-message';
import FormField from '../../../shared/components/form-field';

export default function LoginPage() {
  const session = useQuery(sessionQuery());
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
  });

  if (session.isPending) return <p>Loading…</p>;
  if (session.isError && !session.data) return <p role="alert">{session.error.message}</p>;

  const isTokenOnly = session.data.token_only;
  return <section className="card bg-base-100 max-w-md mx-auto p-6 space-y-4">
    <h1 className="text-2xl font-bold">Login</h1>
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      action.mutate(async () => {
        await request('login', { method: 'POST', json: { username: fields.get('username') ?? '', password: fields.get('password') } });
        window.location.assign(appUrl(''));
        return 'Logged in.';
      });
    }}>
      {isTokenOnly ? <p>Enter the API token from your instance configuration.</p>
        : <FormField label="Username" name="username" autoComplete="username" required />}
      <FormField label={isTokenOnly ? 'API Token' : 'Password'} type="password" name="password" autoComplete="current-password" required />
      <button className="btn btn-primary" disabled={action.isPending}>Login</button>
    </form>
    <ActionMessage state={action} />
  </section>;
}
