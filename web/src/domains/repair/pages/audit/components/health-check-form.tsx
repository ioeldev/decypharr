import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Play } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/shared/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/shared/components/ui/native-select';
import LoadingState from '@/shared/components/loading-state';
import FormField from '@/shared/components/form-field';
import ActionMessage from '@/shared/components/action-message';
import { request } from '@/shared/api/client';
import { repairConfigQuery, repairKeys, repairStatusQuery } from '../../../repair.queries';

export default function HealthCheckForm({ onStarted }: { onStarted: () => void }) {
  const config = useQuery(repairConfigQuery());
  const status = useQuery(repairStatusQuery());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (fields: FormData) =>
      request('api/repair/run', {
        method: 'POST',
        json: {
          library_audit: fields.has('library_audit'),
          ignore_last_checked: fields.has('ignore_last_checked'),
          auto_repair: fields.has('auto_repair'),
          unrestrict_link: true,
          verify_content: fields.has('verify_content'),
          protocol: fields.get('protocol'),
        },
      }).then(() => 'Health check started.'),
    onSuccess: onStarted,
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });

  if (config.isPending) return <LoadingState label="Loading repair configuration…" />;
  if (config.isError && !config.data) return <p role="alert">{config.error.message}</p>;

  const settings = config.data;
  const hasActiveRun = Boolean(status.data?.active_run);

  return (
    <form
      className="flex flex-col gap-6 px-4 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        action.mutate(new FormData(event.currentTarget));
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="field-protocol">Protocol</FieldLabel>
          <NativeSelect id="field-protocol" name="protocol">
            <NativeSelectOption value="all">All protocols</NativeSelectOption>
            <NativeSelectOption value="torrent">Torrent</NativeSelectOption>
            <NativeSelectOption value="nzb">Usenet</NativeSelectOption>
          </NativeSelect>
        </Field>
        <FormField
          label="Audit imported library files"
          type="checkbox"
          name="library_audit"
          description="Check files already imported by Sonarr and Radarr."
          defaultChecked={Boolean(settings.library_audit)}
        />
        <FormField
          label="Include recently checked entries"
          type="checkbox"
          name="ignore_last_checked"
          description="Check entries again even if they were checked recently."
        />
        <FormField
          label="Automatically repair"
          type="checkbox"
          name="auto_repair"
          description="Request replacements through Sonarr or Radarr for broken files."
          defaultChecked={Boolean(settings.auto_repair)}
        />
        <FormField
          label="Verify NZB content"
          type="checkbox"
          name="verify_content"
          description="Read Usenet content to verify it is available."
          defaultChecked={Boolean(settings.verify_content)}
        />
      </FieldGroup>
      {hasActiveRun ? (
        <p className="text-sm text-muted-foreground">
          A health check is already running. Stop it or wait for it to finish before starting
          another.
        </p>
      ) : null}
      <ActionMessage state={action} />
      <Button type="submit" disabled={action.isPending || hasActiveRun || !status.data}>
        {action.isPending ? (
          <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" />
        ) : (
          <Play data-icon="inline-start" />
        )}
        {action.isPending ? 'Starting…' : 'Start health check'}
      </Button>
      {status.isError ? <p role="alert">{status.error.message}</p> : null}
    </form>
  );
}
