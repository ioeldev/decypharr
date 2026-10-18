import { configurationQuery } from '../settings.queries';
import { useQuery } from '@tanstack/react-query';
import SettingsEditor from './components/settings-editor';

export default function SettingsPage() {
  const configuration = useQuery(configurationQuery());
  if (configuration.isPending) return <p>Loading configuration…</p>;
  if (configuration.isError && !configuration.data) return <section><p role="alert">{configuration.error.message}</p><button className="btn" onClick={() => void configuration.refetch()}>Retry</button></section>;

  return <>
    {configuration.isError ? <p role="alert">{configuration.error.message} Showing the last received configuration.</p> : null}
    <SettingsEditor initial={configuration.data} />
  </>;
}
