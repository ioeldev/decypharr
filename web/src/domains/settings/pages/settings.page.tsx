import LoadingState from '@/shared/components/loading-state';
import { Button } from '@/shared/components/ui/button';
import { configurationQuery } from '../settings.queries';
import { useQuery } from '@tanstack/react-query';
import SettingsEditor from './components/settings-editor';

export default function SettingsPage() {
  const configuration = useQuery(configurationQuery());
  if (configuration.isPending) return <LoadingState label="Loading configuration…" />;
  if (configuration.isError && !configuration.data)
    return (
      <section>
        <p role="alert">{configuration.error.message}</p>
        <Button onClick={() => void configuration.refetch()} variant="secondary">
          Retry
        </Button>
      </section>
    );
  return (
    <>
      {configuration.isError ? (
        <p role="alert">{configuration.error.message} Showing the last received configuration.</p>
      ) : null}
      <SettingsEditor initial={configuration.data} />
    </>
  );
}
