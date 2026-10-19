import LoadingState from '@/shared/components/loading-state';
import { FieldGroup } from '@/shared/components/ui/field';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
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
  if (session.isPending) return <LoadingState label="Loading…" />;
  if (session.isError && !session.data) return <p role="alert">{session.error.message}</p>;
  const isTokenOnly = session.data.token_only;
  return (
    <Card className="max-w-md mx-auto  flex flex-col gap-4">
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl font-bold">Login</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            action.mutate(async () => {
              await request('login', {
                method: 'POST',
                json: { username: fields.get('username') ?? '', password: fields.get('password') },
              });
              window.location.assign(appUrl(''));
              return 'Logged in.';
            });
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            {isTokenOnly ? (
              <p>Enter the API token from your instance configuration.</p>
            ) : (
              <FormField label="Username" name="username" autoComplete="username" required />
            )}
            <FormField
              label={isTokenOnly ? 'API Token' : 'Password'}
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
            <Button disabled={action.isPending} variant="default">
              Login
            </Button>
          </FieldGroup>
        </form>
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
