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
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.value = '';
      }
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queuesKeys.all }),
      queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
      queryClient.invalidateQueries({ queryKey: statisticsKeys.all }),
    ]),
  });

  if (config.isPending) return <p>Loading download settings…</p>;
  if (config.isError && !config.data) return <p role="alert">{config.error.message}</p>;

  const settings = config.data;
  return <section className="card bg-base-100 p-6 space-y-6">
    <h1 className="text-2xl font-bold">Add Downloads</h1>
    <form className="space-y-6" onSubmit={(event) => {
      event.preventDefault();
      action.mutate(event.currentTarget);
    }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      for (const [name, extension] of [['files', '.torrent'], ['nzbFiles', '.nzb']]) {
        const input = event.currentTarget.elements.namedItem(name ?? '');
        if (!(input instanceof HTMLInputElement)) continue;

        const transfer = new DataTransfer();
        for (const file of event.dataTransfer.files) {
          if (file.name.toLowerCase().endsWith(extension ?? '')) transfer.items.add(file);
        }
        input.files = transfer.files;
      }
    }}>
      <div className="grid grid-cols-2 gap-6">
        <label className="fieldset">Magnet links or torrent URLs<textarea className="textarea w-full h-32" name="urls" defaultValue={new URLSearchParams(location.search).get('magnet') ?? ''} /><input className="file-input" type="file" name="files" accept=".torrent" multiple /></label>
        <label className="fieldset">NZB URLs<textarea className="textarea w-full h-32" name="nzbURLs" /><input className="file-input" type="file" name="nzbFiles" accept=".nzb" multiple /></label>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <label className="fieldset">Post Download Action<select name="action" className="select" defaultValue={readPreference('downloadAction') ?? 'symlink'} onChange={(event) => savePreference('downloadAction', event.target.value)}>
          <option value="symlink">Create Symlink</option><option value="download">Download Files</option><option value="none">No Action</option>
        </select></label>
        <FormField label="Download Folder" name="downloadFolder" defaultValue={readPreference('downloadFolder') ?? settings.download_folder ?? ''} onChange={(event) => savePreference('downloadFolder', event.target.value)} />
        <FormField label="Arr Category" name="arr" defaultValue={readPreference('downloadCategory') ?? ''} onChange={(event) => savePreference('downloadCategory', event.target.value)} />
        <label className="fieldset">Debrid Service<select name="debrid" className="select"><option value="">Auto (try all available)</option>{settings.debrids?.map((provider) => <option key={provider.name}>{provider.name}</option>)}</select></label>
        <FormField label="Download Uncached Content" name="downloadUncached" type="checkbox" defaultChecked={readPreference('downloadUncached') === 'true'} onChange={(event) => savePreference('downloadUncached', String(event.target.checked))} />
        <FormField label="Skip Multi-Season Checker" name="skipMultiSeason" type="checkbox" />
        {settings.always_rm_tracker_urls ? <input type="hidden" name="rmTrackerUrls" value="true" /> : null}
        <FormField disabled={settings.always_rm_tracker_urls} label="Remove Tracker URLs" name="rmTrackerUrls" type="checkbox" defaultChecked={settings.always_rm_tracker_urls || readPreference('rmTrackerUrls') === 'true'} onChange={(event) => savePreference('rmTrackerUrls', String(event.target.checked))} />
      </div>
      <button className="btn btn-primary" disabled={action.isPending}>Add to Download Queue</button>
    </form>
    <ActionMessage state={action} />
  </section>;
}
