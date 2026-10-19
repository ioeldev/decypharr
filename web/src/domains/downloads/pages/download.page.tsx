import LoadingState from '@/shared/components/loading-state';
import { FieldGroup, Field, FieldLabel } from '@/shared/components/ui/field';
import { Textarea } from '@/shared/components/ui/textarea';
import { Input } from '@/shared/components/ui/input';
import { NativeSelectOption, NativeSelect } from '@/shared/components/ui/native-select';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { statisticsKeys } from '../../statistics/statistics.queries';
import { queuesKeys } from '../../queues/queues.queries';
import { libraryKeys } from '../../library/library.queries';
import { configurationQuery } from '../../settings/settings.queries';
import { readPreference, savePreference } from '../../../shared/browser/preferences';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../shared/components/action-message';
import FormField from '../../../shared/components/form-field';
import { addDownloads, downloadConfigSchema } from '../downloads.api';

export default function DownloadPage() {
  const config = useQuery({ ...configurationQuery(), select: downloadConfigSchema.parse });
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: addDownloads,
    onSuccess: (_message, form) => {
      for (const name of ['urls', 'nzbURLs', 'files', 'nzbFiles']) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)
          input.value = '';
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queuesKeys.all }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
        queryClient.invalidateQueries({ queryKey: statisticsKeys.all }),
      ]),
  });
  if (config.isPending) return <LoadingState label="Loading download settings…" />;
  if (config.isError && !config.data) return <p role="alert">{config.error.message}</p>;
  const settings = config.data;
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl font-bold">Add Downloads</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            action.mutate(event.currentTarget);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            for (const [name, extension] of [
              ['files', '.torrent'],
              ['nzbFiles', '.nzb'],
            ]) {
              const input = event.currentTarget.elements.namedItem(name ?? '');
              if (!(input instanceof HTMLInputElement)) continue;
              const transfer = new DataTransfer();
              for (const file of event.dataTransfer.files) {
                if (file.name.toLowerCase().endsWith(extension ?? '')) transfer.items.add(file);
              }
              input.files = transfer.files;
            }
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <FieldGroup className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="field-magnet-links-or-torrent-urls">
                  Magnet links or torrent URLs
                </FieldLabel>
                <Textarea
                  id="field-magnet-links-or-torrent-urls"
                  name="urls"
                  defaultValue={new URLSearchParams(location.search).get('magnet') ?? ''}
                  className="w-full h-24"
                />
                <Input
                  aria-label="Torrent files"
                  type="file"
                  name="files"
                  accept=".torrent"
                  multiple
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="field-nzb-urls">NZB URLs</FieldLabel>
                <Textarea id="field-nzb-urls" name="nzbURLs" className="w-full h-24" />
                <Input aria-label="NZB files" type="file" name="nzbFiles" accept=".nzb" multiple />
              </Field>
            </FieldGroup>
            <FieldGroup className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <Field>
                <FieldLabel htmlFor="field-post-download-action">Post Download Action</FieldLabel>
                <NativeSelect
                  id="field-post-download-action"
                  name="action"
                  defaultValue={readPreference('downloadAction') ?? 'symlink'}
                  onChange={(event) => savePreference('downloadAction', event.target.value)}
                >
                  <NativeSelectOption value="symlink">Create Symlink</NativeSelectOption>
                  <NativeSelectOption value="download">Download Files</NativeSelectOption>
                  <NativeSelectOption value="none">No Action</NativeSelectOption>
                </NativeSelect>
              </Field>
              <FormField
                label="Download Folder"
                name="downloadFolder"
                defaultValue={readPreference('downloadFolder') ?? settings.download_folder ?? ''}
                onChange={(event) => savePreference('downloadFolder', event.target.value)}
              />
              <FormField
                label="Arr Category"
                name="arr"
                defaultValue={readPreference('downloadCategory') ?? ''}
                onChange={(event) => savePreference('downloadCategory', event.target.value)}
              />
              <Field>
                <FieldLabel htmlFor="field-debrid-service">Debrid Service</FieldLabel>
                <NativeSelect id="field-debrid-service" name="debrid">
                  <NativeSelectOption value="">Auto (try all available)</NativeSelectOption>
                  {settings.debrids?.map((provider) => (
                    <NativeSelectOption key={provider.name}>{provider.name}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <FormField
                label="Download Uncached Content"
                name="downloadUncached"
                type="checkbox"
                defaultChecked={readPreference('downloadUncached') === 'true'}
                onCheckedChange={(event) =>
                  savePreference('downloadUncached', String(event === true))
                }
              />
              <FormField label="Skip Multi-Season Checker" name="skipMultiSeason" type="checkbox" />
              {settings.always_rm_tracker_urls ? (
                <input type="hidden" name="rmTrackerUrls" value="true" />
              ) : null}
              <FormField
                disabled={settings.always_rm_tracker_urls}
                label="Remove Tracker URLs"
                name="rmTrackerUrls"
                type="checkbox"
                defaultChecked={
                  settings.always_rm_tracker_urls || readPreference('rmTrackerUrls') === 'true'
                }
                onCheckedChange={(event) => savePreference('rmTrackerUrls', String(event === true))}
              />
            </FieldGroup>
            <Button disabled={action.isPending} variant="default">
              Add to Download Queue
            </Button>
          </FieldGroup>
        </form>
        <ActionMessage state={action} />
      </CardContent>
    </Card>
  );
}
