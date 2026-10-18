import LoadingState from '@/shared/components/loading-state';
import { FieldGroup, Field, FieldLabel } from '@/shared/components/ui/field';
import { NativeSelectOption, NativeSelect } from '@/shared/components/ui/native-select';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { repairKeys, repairConfigQuery } from '../../../repair.queries';
import { request } from '../../../../../shared/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FormField from '../../../../../shared/components/form-field';
import ActionMessage from '../../../../../shared/components/action-message';

export default function RunControls() {
  const config = useQuery(repairConfigQuery());
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repairKeys.all }),
  });
  if (config.isPending) return <LoadingState label="Loading repair configuration…" />;
  if (config.isError && !config.data) return <p role="alert">{config.error.message}</p>;
  const settings = config.data;
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl">Run a health check</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            action.mutate(async () => {
              await request('api/repair/run', {
                method: 'POST',
                json: {
                  library_audit: fields.has('library_audit'),
                  ignore_last_checked: fields.has('ignore_last_checked'),
                  auto_repair: fields.has('auto_repair'),
                  unrestrict_link: true,
                  verify_content: fields.has('verify_content'),
                  protocol: fields.get('protocol'),
                },
              });
              return 'Health check started.';
            });
          }}
          className="flex flex-col gap-3"
        >
          <FieldGroup>
            <div className="flex gap-5 flex-wrap">
              <FormField
                label="Audit imported library files"
                type="checkbox"
                name="library_audit"
                defaultChecked={Boolean(settings.library_audit)}
              />
              <FormField
                label="Include recently checked entries"
                type="checkbox"
                name="ignore_last_checked"
              />
              <FormField
                label="Automatically repair"
                type="checkbox"
                name="auto_repair"
                defaultChecked={Boolean(settings.auto_repair)}
              />
              <FormField
                label="Verify NZB content"
                type="checkbox"
                name="verify_content"
                defaultChecked={Boolean(settings.verify_content)}
              />
              <Field>
                <FieldLabel htmlFor="field-protocol">Protocol</FieldLabel>
                <NativeSelect id="field-protocol" name="protocol">
                  <NativeSelectOption value="all">All</NativeSelectOption>
                  <NativeSelectOption value="torrent">Torrent</NativeSelectOption>
                  <NativeSelectOption value="nzb">Usenet</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
            <Button disabled={action.isPending} variant="default">
              Run Now
            </Button>
          </FieldGroup>
        </form>
        <div className="flex gap-3 flex-wrap">
          <Button
            disabled={action.isPending}
            onClick={() =>
              action.mutate(async () => {
                await request('api/repair/stop', { method: 'POST' });
                return 'Stop requested.';
              })
            }
            variant="secondary"
          >
            Stop Run
          </Button>
          <Button
            disabled={action.isPending}
            onClick={() => {
              if (
                !confirm('Send delete and re-search requests for all broken entries to their Arr?')
              )
                return;
              action.mutate(async () => {
                await request('api/repair/fix', { method: 'POST', json: {} });
                return 'Recovery submission started.';
              });
            }}
            variant="secondary"
          >
            Fix Broken Entries
          </Button>
        </div>
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
