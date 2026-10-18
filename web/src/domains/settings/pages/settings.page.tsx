import { jsonObjectSchema } from '../../../shared/api/json-response';
import { useApiResource } from '../../../shared/hooks/use-api-resource';
import SettingsEditor from './components/settings-editor';

export default function SettingsPage() {
  const configuration = useApiResource({ path: 'api/config', parse: jsonObjectSchema.parse });
  if (configuration.state.kind === 'loading') return <p>Loading configuration…</p>;
  if (configuration.state.kind === 'error') return <section><p role="alert">{configuration.state.message}</p><button className="btn" onClick={() => configuration.reload()}>Retry</button></section>;

  return <SettingsEditor initial={configuration.state.value} />;
}
