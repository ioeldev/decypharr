import { appUrl, request } from '../../../shared/api/client';
import { useApiResource } from '../../../shared/hooks/use-api-resource';
import { useAction } from '../../../shared/hooks/use-action';
import ActionMessage from '../../../shared/components/action-message';
import FormField from '../../../shared/components/form-field';
import { sessionSchema } from '../auth.api';

export default function LoginPage() {
  const session = useApiResource({ path: 'api/ui', parse: sessionSchema.parse });
  const action = useAction();

  if (session.state.kind === 'loading') return <p>Loading…</p>;
  if (session.state.kind === 'error') return <p role="alert">{session.state.message}</p>;

  const isTokenOnly = session.state.value.token_only;
  return <section className="card bg-base-100 max-w-md mx-auto p-6 space-y-4">
    <h1 className="text-2xl font-bold">Login</h1>
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      action.run(async () => {
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
    <ActionMessage state={action.state} />
  </section>;
}
