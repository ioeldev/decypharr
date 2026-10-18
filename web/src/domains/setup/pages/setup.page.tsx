import { FieldLabel } from '@/shared/components/ui/field';
import { FieldGroup, FieldLegend, Field, FieldSet } from '@/shared/components/ui/field';
import { Badge } from '@/shared/components/ui/badge';
import { Textarea } from '@/shared/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { NativeSelectOption, NativeSelect } from '@/shared/components/ui/native-select';
import { Button } from '@/shared/components/ui/button';
import { useState } from 'react';
import { z } from 'zod';
import { appUrl, requestJson } from '../../../shared/api/client';
import { useMutation } from '@tanstack/react-query';
import ActionMessage from '../../../shared/components/action-message';
import FormField from '../../../shared/components/form-field';

const steps = ['Authentication', 'Debrid', 'Usenet', 'Downloads', 'Mount', 'Review'];
const setupResponse = z.object({
  success: z.boolean(),
  api_token: z.string().optional(),
  message: z.string().optional(),
});
export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [authMode, setAuthMode] = useState('password');
  const [provider, setProvider] = useState('realdebrid');
  const [hasUsenet, setHasUsenet] = useState(false);
  const [mountType, setMountType] = useState('dfs');
  const [token, setToken] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
  });
  if (isComplete)
    return (
      <Card className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl">Setup complete</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {token ? (
            <>
              <p>Save this API token. It is your login credential.</p>
              <Textarea readOnly value={token} className="w-full" />
            </>
          ) : null}
          <p>Services are restarting. Continue when the server is ready.</p>
          <Button asChild variant="default">
            <a href={appUrl('')}>Continue</a>
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <Card className="flex flex-col gap-6 max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl font-bold">Setup Wizard</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <ol aria-label="Setup progress" className="flex flex-wrap gap-2">
          {steps.map((title, index) => (
            <li key={title} aria-current={index === step ? 'step' : undefined}>
              <Badge variant={index <= step ? 'default' : 'secondary'}>
                {index + 1}. {title}
              </Badge>
            </li>
          ))}
        </ol>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (step < 5) {
              setStep(step + 1);
              return;
            }
            const fields = new FormData(event.currentTarget);
            action.mutate(async () => {
              if (provider === '' && !hasUsenet)
                throw new Error('Configure at least one Debrid or Usenet provider.');
              if (
                authMode === 'password' &&
                fields.get('password') !== fields.get('confirmPassword')
              )
                throw new Error('Passwords do not match.');
              const response = setupResponse.parse(
                await requestJson('api/setup/complete', {
                  method: 'POST',
                  json: {
                    auth: {
                      username: fields.get('username'),
                      password: fields.get('password'),
                      skip_auth: authMode === 'none',
                      token_only: authMode === 'token',
                    },
                    debrid: {
                      provider,
                      api_key: fields.get('api_key'),
                      skip_debrid: provider === '',
                    },
                    usenet: {
                      host: fields.get('host'),
                      port: Number(fields.get('port')),
                      username: fields.get('usenet_username'),
                      password: fields.get('usenet_password'),
                      max_connections: Number(fields.get('max_connections')),
                      reader_connections: Number(fields.get('reader_connections')),
                      ssl: fields.has('ssl'),
                      skip_usenet: !hasUsenet,
                    },
                    download: { download_folder: fields.get('download_folder') },
                    mount: {
                      mount_type: mountType,
                      mount_path: fields.get('mount_path'),
                      cache_dir: fields.get('cache_dir'),
                      rclone_buffer_size: fields.get('rclone_buffer_size'),
                    },
                  },
                }),
              );
              if (!response.success)
                throw new Error(response.message ?? 'Setup could not be completed.');
              setToken(response.api_token ?? '');
              setIsComplete(true);
              return 'Setup completed.';
            });
          }}
          className="flex flex-col gap-6"
        >
          <FieldGroup>
            <FieldSet hidden={step !== 0} className="flex flex-col gap-4">
              <FieldLegend className="text-xl">Authentication</FieldLegend>
              <Field>
                <FieldLabel htmlFor="field-authentication-mode">Authentication mode</FieldLabel>
                <NativeSelect
                  id="field-authentication-mode"
                  value={authMode}
                  onChange={(event) => setAuthMode(event.target.value)}
                >
                  <NativeSelectOption value="password">Username and password</NativeSelectOption>
                  <NativeSelectOption value="token">API token only</NativeSelectOption>
                  <NativeSelectOption value="none">No authentication</NativeSelectOption>
                </NativeSelect>
              </Field>
              {authMode === 'password' ? (
                <>
                  <FormField
                    label="Username"
                    name="username"
                    autoComplete="username"
                    required={step === 0}
                  />
                  <FormField
                    label="Password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required={step === 0}
                  />
                  <FormField
                    label="Confirm password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required={step === 0}
                  />
                </>
              ) : null}
            </FieldSet>
            <FieldSet hidden={step !== 1} className="flex flex-col gap-4">
              <FieldLegend className="text-xl">Debrid provider</FieldLegend>
              <Field>
                <FieldLabel htmlFor="field-provider">Provider</FieldLabel>
                <NativeSelect
                  id="field-provider"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                >
                  <NativeSelectOption value="">Skip Debrid</NativeSelectOption>
                  {['realdebrid', 'alldebrid', 'debridlink', 'torbox', 'premiumize'].map((name) => (
                    <NativeSelectOption key={name}>{name}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <FormField
                label="API key"
                name="api_key"
                type="password"
                required={step === 1 && provider !== ''}
              />
            </FieldSet>
            <FieldSet hidden={step !== 2} className="flex flex-col gap-4">
              <FieldLegend className="text-xl">Usenet</FieldLegend>
              <FormField
                label="Configure Usenet"
                type="checkbox"
                checked={hasUsenet}
                onCheckedChange={(event) => setHasUsenet(event === true)}
              />
              <FormField label="Host" name="host" required={step === 2 && hasUsenet} />
              <FormField
                label="Port"
                name="port"
                type="number"
                defaultValue="563"
                min="1"
                max="65535"
              />
              <FormField
                label="Username"
                name="usenet_username"
                required={step === 2 && hasUsenet}
              />
              <FormField
                label="Password"
                name="usenet_password"
                type="password"
                required={step === 2 && hasUsenet}
              />
              <FormField label="Use TLS" name="ssl" type="checkbox" defaultChecked />
              <FormField
                label="Provider connections"
                name="max_connections"
                type="number"
                defaultValue="20"
                min="1"
              />
              <FormField
                label="Streaming connections"
                name="reader_connections"
                type="number"
                defaultValue="15"
                min="1"
              />
            </FieldSet>
            <FieldSet hidden={step !== 3} className="flex flex-col gap-4">
              <FieldLegend className="text-xl">Downloads</FieldLegend>
              <FormField
                label="Download folder"
                name="download_folder"
                placeholder="/downloads"
                required={step === 3}
              />
            </FieldSet>
            <FieldSet hidden={step !== 4} className="flex flex-col gap-4">
              <FieldLegend className="text-xl">Mount</FieldLegend>
              <Field>
                <FieldLabel htmlFor="field-mount-system">Mount system</FieldLabel>
                <NativeSelect
                  id="field-mount-system"
                  value={mountType}
                  onChange={(event) => setMountType(event.target.value)}
                >
                  <NativeSelectOption value="dfs">DFS</NativeSelectOption>
                  <NativeSelectOption value="rclone">Rclone</NativeSelectOption>
                  <NativeSelectOption value="external_rclone">External Rclone</NativeSelectOption>
                  <NativeSelectOption value="none">None</NativeSelectOption>
                </NativeSelect>
              </Field>
              <FormField
                label="Mount path"
                name="mount_path"
                placeholder="/mnt/decypharr"
                required={step === 4 && mountType !== 'none'}
              />
              <FormField
                label="Cache directory"
                name="cache_dir"
                placeholder="/cache"
                required={step === 4 && mountType === 'dfs'}
              />
              <FormField label="Rclone buffer size" name="rclone_buffer_size" defaultValue="32M" />
            </FieldSet>
            {step === 5 ? (
              <div className="flex flex-col gap-3">
                <h2 className="text-xl">Review</h2>
                <p>Authentication: {authMode}</p>
                <p>Debrid: {provider || 'Skipped'}</p>
                <p>Usenet: {hasUsenet ? 'Configured' : 'Skipped'}</p>
                <p>Mount: {mountType}</p>
                <p>Use Back to review your folders and provider details before completing setup.</p>
              </div>
            ) : null}
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                disabled={step === 0 || action.isPending}
                onClick={() => setStep(step - 1)}
                variant="secondary"
              >
                Back
              </Button>
              <Button disabled={action.isPending} variant="default">
                {step === 5 ? 'Complete Setup' : 'Next'}
              </Button>
            </div>
          </FieldGroup>
        </form>
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
