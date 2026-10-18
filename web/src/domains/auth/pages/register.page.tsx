import { FieldGroup } from '@/shared/components/ui/field';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { appUrl, request } from '../../../shared/api/client';
import { useMutation } from '@tanstack/react-query';
import ActionMessage from '../../../shared/components/action-message';
import FormField from '../../../shared/components/form-field';

export default function RegisterPage() {
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
  });
  return (
    <Card className="max-w-md mx-auto  flex flex-col gap-4">
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl font-bold">Create Account</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            action.mutate(async () => {
              if (form.get('password') !== form.get('confirmPassword'))
                throw new Error('Passwords do not match.');
              const body = new URLSearchParams();
              for (const [name, value] of form) body.set(name, String(value));
              await request('register', { method: 'POST', body });
              window.location.assign(appUrl(''));
              return 'Account created.';
            });
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <FormField label="Username" name="username" autoComplete="username" required />
            <FormField
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
            <FormField
              label="Confirm password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
            />
            <Button disabled={action.isPending} variant="default">
              Create Account
            </Button>
          </FieldGroup>
        </form>
        <Button
          disabled={action.isPending}
          onClick={() =>
            action.mutate(async () => {
              await request('skip-auth', { method: 'POST' });
              window.location.assign(appUrl(''));
              return 'Authentication disabled.';
            })
          }
          variant="outline"
        >
          Skip Authentication
        </Button>
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
