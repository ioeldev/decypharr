import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestJson } from '../../../../shared/api/client';
import { jsonObjectSchema, stringValue, type JsonObject } from '../../../../shared/api/json-response';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import FormField from '../../../../shared/components/form-field';
import ActionMessage from '../../../../shared/components/action-message';

export default function AuthenticationSettings({ initial }: { initial: JsonObject }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState(initial.auth_token_only ? 'token' : initial.use_auth ? 'password' : 'none');
  const [token, setToken] = useState(stringValue(initial.api_token));
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
  });
  return <section className="space-y-5">
    <h2 className="text-xl">Authentication</h2>
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      action.mutate(async () => {
        const response = jsonObjectSchema.parse(await requestJson('api/update-auth', { method: 'POST', json: {
          username: mode === 'password' ? fields.get('username') : '', password: mode === 'password' ? fields.get('password') : '',
          confirm_password: fields.get('confirm_password') ?? '', token_only: mode === 'token',
        } }));
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'version' });
        if (typeof response.token === 'string') setToken(response.token);
        return `${stringValue(response.message)}. Existing sessions are invalidated; log in again if authentication is enabled.`;
      });
    }}>
      <label className="fieldset">Mode<select className="select" value={mode} onChange={(event) => setMode(event.target.value)}><option value="password">Username and password</option><option value="token">API token only</option><option value="none">Disabled</option></select></label>
      {mode === 'password' ? <><FormField name="username" label="Username" defaultValue={stringValue(initial.auth_username)} required /><FormField name="password" label="New password" type="password" autoComplete="new-password" required /><FormField name="confirm_password" label="Confirm password" type="password" autoComplete="new-password" required /></> : null}
      <button className="btn btn-primary" disabled={action.isPending}>Update Authentication</button>
    </form>
    <FormField label="API Token" type="password" value={token} readOnly />
    {token ? <button className="btn btn-sm" onClick={() => action.mutate(async () => { await navigator.clipboard.writeText(token); return 'API token copied.'; })}>Copy Token</button> : null}
    <button className="btn btn-warning" disabled={action.isPending} onClick={() => {
      if (!confirm('Rotate the API token? Existing integrations and browser sessions will need the new credential.')) return;
      action.mutate(async () => { const response = jsonObjectSchema.parse(await requestJson('api/refresh-token', { method: 'POST' })); setToken(stringValue(response.token)); queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'version' }); return 'API token rotated. Save it and log in again.'; });
    }}>Rotate API Token</button>
    <Link className="btn btn-outline" to="/login">Log In</Link>
    <ActionMessage state={action} />
  </section>;
}
