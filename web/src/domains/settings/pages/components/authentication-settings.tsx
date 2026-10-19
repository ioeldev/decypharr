import { FieldGroup, Field, FieldLabel } from '@/shared/components/ui/field';
import { NativeSelectOption, NativeSelect } from '@/shared/components/ui/native-select';
import { Button } from '@/shared/components/ui/button';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestJson } from '../../../../shared/api/client';
import {
  jsonObjectSchema,
  stringValue,
  type JsonObject,
} from '../../../../shared/api/json-response';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import FormField from '../../../../shared/components/form-field';
import ActionMessage from '../../../../shared/components/action-message';

export default function AuthenticationSettings({ initial }: { initial: JsonObject }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState(
    initial.auth_token_only ? 'token' : initial.use_auth ? 'password' : 'none',
  );
  const [token, setToken] = useState(stringValue(initial.api_token));
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
  });
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-xl">Authentication</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          action.mutate(async () => {
            const response = jsonObjectSchema.parse(
              await requestJson('api/update-auth', {
                method: 'POST',
                json: {
                  username: mode === 'password' ? fields.get('username') : '',
                  password: mode === 'password' ? fields.get('password') : '',
                  confirm_password: fields.get('confirm_password') ?? '',
                  token_only: mode === 'token',
                },
              }),
            );
            queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'version' });
            if (typeof response.token === 'string') setToken(response.token);
            return `${stringValue(response.message)}. Existing sessions are invalidated; log in again if authentication is enabled.`;
          });
        }}
        className="flex flex-col gap-4"
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="field-mode">Mode</FieldLabel>
            <NativeSelect
              id="field-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <NativeSelectOption value="password">Username and password</NativeSelectOption>
              <NativeSelectOption value="token">API token only</NativeSelectOption>
              <NativeSelectOption value="none">Disabled</NativeSelectOption>
            </NativeSelect>
          </Field>
          {mode === 'password' ? (
            <>
              <FormField
                name="username"
                label="Username"
                defaultValue={stringValue(initial.auth_username)}
                required
              />
              <FormField
                name="password"
                label="New password"
                type="password"
                autoComplete="new-password"
                required
              />
              <FormField
                name="confirm_password"
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                required
              />
            </>
          ) : null}
          <Button disabled={action.isPending} variant="default">
            Update Authentication
          </Button>
        </FieldGroup>
      </form>
      <FormField label="API Token" type="password" value={token} readOnly />
      {token ? (
        <Button
          onClick={() =>
            action.mutate(async () => {
              await navigator.clipboard.writeText(token);
              return 'API token copied.';
            })
          }
          variant="secondary"
          size="sm"
        >
          Copy Token
        </Button>
      ) : null}
      <Button
        disabled={action.isPending}
        onClick={() => {
          if (
            !confirm(
              'Rotate the API token? Existing integrations and browser sessions will need the new credential.',
            )
          )
            return;
          action.mutate(async () => {
            const response = jsonObjectSchema.parse(
              await requestJson('api/refresh-token', { method: 'POST' }),
            );
            setToken(stringValue(response.token));
            queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'version' });
            return 'API token rotated. Save it and log in again.';
          });
        }}
        variant="secondary"
      >
        Rotate API Token
      </Button>
      <Button asChild variant="outline">
        <Link to="/login">Log In</Link>
      </Button>
      <ActionMessage state={action} />
    </section>
  );
}
