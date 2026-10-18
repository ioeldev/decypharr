import { appUrl, request } from '../../../shared/api/client';
import { useAction } from '../../../shared/hooks/use-action';
import ActionMessage from '../../../shared/components/action-message';
import FormField from '../../../shared/components/form-field';

export default function RegisterPage() {
  const action = useAction();

  return <section className="card bg-base-100 max-w-md mx-auto p-6 space-y-4">
    <h1 className="text-2xl font-bold">Create Account</h1>
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      action.run(async () => {
        if (form.get('password') !== form.get('confirmPassword')) throw new Error('Passwords do not match.');

        const body = new URLSearchParams();
        for (const [name, value] of form) body.set(name, String(value));
        await request('register', { method: 'POST', body });
        window.location.assign(appUrl(''));
        return 'Account created.';
      });
    }}>
      <FormField label="Username" name="username" autoComplete="username" required />
      <FormField label="Password" name="password" type="password" autoComplete="new-password" required />
      <FormField label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required />
      <button className="btn btn-primary" disabled={action.isPending}>Create Account</button>
    </form>
    <button className="btn btn-outline" disabled={action.isPending} onClick={() => action.run(async () => {
      await request('skip-auth', { method: 'POST' });
      window.location.assign(appUrl(''));
      return 'Authentication disabled.';
    })}>Skip Authentication</button>
    <ActionMessage state={action.state} />
  </section>;
}
