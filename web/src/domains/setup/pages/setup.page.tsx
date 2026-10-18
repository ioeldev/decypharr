import { useState } from 'react';
import { z } from 'zod';
import { appUrl, requestJson } from '../../../shared/api/client';
import { useAction } from '../../../shared/hooks/use-action';
import ActionMessage from '../../../shared/components/action-message';
import FormField from '../../../shared/components/form-field';

const steps = ['Authentication', 'Debrid', 'Usenet', 'Downloads', 'Mount', 'Review'];
const setupResponse = z.object({ success: z.boolean(), api_token: z.string().optional(), message: z.string().optional() });

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [authMode, setAuthMode] = useState('password');
  const [provider, setProvider] = useState('realdebrid');
  const [hasUsenet, setHasUsenet] = useState(false);
  const [mountType, setMountType] = useState('dfs');
  const [token, setToken] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const action = useAction();

  if (isComplete) return <section className="card bg-base-100 p-6 space-y-4">
    <h1 className="text-2xl">Setup complete</h1>
    {token ? <><p>Save this API token. It is your login credential.</p><textarea className="textarea w-full" readOnly value={token} /></> : null}
    <p>Services are restarting. Continue when the server is ready.</p>
    <a href={appUrl('')} className="btn btn-primary">Continue</a>
  </section>;

  return <section className="card bg-base-100 p-6 space-y-6 max-w-4xl mx-auto">
    <h1 className="text-2xl font-bold">Setup Wizard</h1>
    <ol className="steps">{steps.map((title, index) => <li key={title} className={`step ${index <= step ? 'step-primary' : ''}`}>{title}</li>)}</ol>
    <form className="space-y-6" onSubmit={(event) => {
      event.preventDefault();
      if (step < 5) { setStep(step + 1); return; }

      const fields = new FormData(event.currentTarget);
      action.run(async () => {
        if (provider === '' && !hasUsenet) throw new Error('Configure at least one Debrid or Usenet provider.');
        if (authMode === 'password' && fields.get('password') !== fields.get('confirmPassword')) throw new Error('Passwords do not match.');

        const response = setupResponse.parse(await requestJson('api/setup/complete', { method: 'POST', json: {
          auth: { username: fields.get('username'), password: fields.get('password'), skip_auth: authMode === 'none', token_only: authMode === 'token' },
          debrid: { provider, api_key: fields.get('api_key'), skip_debrid: provider === '' },
          usenet: { host: fields.get('host'), port: Number(fields.get('port')), username: fields.get('usenet_username'), password: fields.get('usenet_password'), max_connections: Number(fields.get('max_connections')), reader_connections: Number(fields.get('reader_connections')), ssl: fields.has('ssl'), skip_usenet: !hasUsenet },
          download: { download_folder: fields.get('download_folder') },
          mount: { mount_type: mountType, mount_path: fields.get('mount_path'), cache_dir: fields.get('cache_dir'), rclone_buffer_size: fields.get('rclone_buffer_size') },
        } }));
        if (!response.success) throw new Error(response.message ?? 'Setup could not be completed.');

        setToken(response.api_token ?? '');
        setIsComplete(true);
        return 'Setup completed.';
      });
    }}>
      <fieldset hidden={step !== 0} className="space-y-4">
        <legend className="text-xl">Authentication</legend>
        <label className="fieldset">Authentication mode<select className="select" value={authMode} onChange={(event) => setAuthMode(event.target.value)}>
          <option value="password">Username and password</option><option value="token">API token only</option><option value="none">No authentication</option>
        </select></label>
        {authMode === 'password' ? <>
          <FormField label="Username" name="username" autoComplete="username" required={step === 0} />
          <FormField label="Password" name="password" type="password" autoComplete="new-password" required={step === 0} />
          <FormField label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required={step === 0} />
        </> : null}
      </fieldset>
      <fieldset hidden={step !== 1} className="space-y-4">
        <legend className="text-xl">Debrid provider</legend>
        <label className="fieldset">Provider<select className="select" value={provider} onChange={(event) => setProvider(event.target.value)}>
          <option value="">Skip Debrid</option>{['realdebrid', 'alldebrid', 'debridlink', 'torbox', 'premiumize'].map((name) => <option key={name}>{name}</option>)}
        </select></label>
        <FormField label="API key" name="api_key" type="password" required={step === 1 && provider !== ''} />
      </fieldset>
      <fieldset hidden={step !== 2} className="space-y-4">
        <legend className="text-xl">Usenet</legend>
        <FormField label="Configure Usenet" type="checkbox" checked={hasUsenet} onChange={(event) => setHasUsenet(event.target.checked)} />
        <FormField label="Host" name="host" required={step === 2 && hasUsenet} />
        <FormField label="Port" name="port" type="number" defaultValue="563" min="1" max="65535" />
        <FormField label="Username" name="usenet_username" required={step === 2 && hasUsenet} />
        <FormField label="Password" name="usenet_password" type="password" required={step === 2 && hasUsenet} />
        <FormField label="Use TLS" name="ssl" type="checkbox" defaultChecked />
        <FormField label="Provider connections" name="max_connections" type="number" defaultValue="20" min="1" />
        <FormField label="Streaming connections" name="reader_connections" type="number" defaultValue="15" min="1" />
      </fieldset>
      <fieldset hidden={step !== 3} className="space-y-4">
        <legend className="text-xl">Downloads</legend>
        <FormField label="Download folder" name="download_folder" placeholder="/downloads" required={step === 3} />
      </fieldset>
      <fieldset hidden={step !== 4} className="space-y-4">
        <legend className="text-xl">Mount</legend>
        <label className="fieldset">Mount system<select className="select" value={mountType} onChange={(event) => setMountType(event.target.value)}>
          <option value="dfs">DFS</option><option value="rclone">Rclone</option><option value="external_rclone">External Rclone</option><option value="none">None</option>
        </select></label>
        <FormField label="Mount path" name="mount_path" placeholder="/mnt/decypharr" required={step === 4 && mountType !== 'none'} />
        <FormField label="Cache directory" name="cache_dir" placeholder="/cache" required={step === 4 && mountType === 'dfs'} />
        <FormField label="Rclone buffer size" name="rclone_buffer_size" defaultValue="32M" />
      </fieldset>
      {step === 5 ? <div className="space-y-3"><h2 className="text-xl">Review</h2><p>Authentication: {authMode}</p><p>Debrid: {provider || 'Skipped'}</p><p>Usenet: {hasUsenet ? 'Configured' : 'Skipped'}</p><p>Mount: {mountType}</p><p>Use Back to review your folders and provider details before completing setup.</p></div> : null}
      <div className="flex gap-2">
        <button type="button" className="btn" disabled={step === 0 || action.isPending} onClick={() => setStep(step - 1)}>Back</button>
        <button className="btn btn-primary" disabled={action.isPending}>{step === 5 ? 'Complete Setup' : 'Next'}</button>
      </div>
    </form>
    <ActionMessage state={action.state} />
  </section>;
}
