import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { request, requestJson } from '../../../../shared/api/client';
import { arrayValue, jsonObjectSchema, objectValue, type JsonObject } from '../../../../shared/api/json-response';
import { useAction } from '../../../../shared/hooks/use-action';
import ActionMessage from '../../../../shared/components/action-message';
import { settingsFields } from '../../settings.fields';
import SettingsObject from './settings-object';
import SettingsField from './settings-field';
import AuthenticationSettings from './authentication-settings';
import VirtualFolderPreview from './virtual-folder-preview';

const sectionNames = ['debrids', 'arrs', 'usenet', 'mount', 'nfs', 'smb', 'share_cache', 'repair', 'virtual_folders', 'strm', 'hearsay', 'notifications', 'queue_cleanup'];

export default function SettingsEditor({ initial }: { initial: JsonObject }) {
  const [savedConfiguration, setSavedConfiguration] = useState(initial);
  const [configuration, setConfiguration] = useState(initial);
  const [parameters, setParameters] = useSearchParams();
  const tab = parameters.get('tab') ?? 'general';
  const action = useAction();
  const sections = settingsFields.filter((field) => sectionNames.includes(field.name));
  const current = sections.find((field) => field.name === tab);

  function saveConfiguration(): Promise<string> {
    const { session_secret, api_token, auth_username, auth_token_only, use_auth, enable_webdav_auth, ...editable } = configuration;
    void session_secret; void api_token; void auth_username; void auth_token_only; void use_auth; void enable_webdav_auth;
    return requestJson('api/config', { method: 'POST', json: editable })
      .then(jsonObjectSchema.parse)
      .then((response) => {
        setSavedConfiguration(configuration);
        return response.restarted ? 'Configuration saved. Services are restarting; refresh once the server is ready.' : 'Configuration saved.';
      });
  }

  return <section className="space-y-5">
    <h1 className="text-2xl font-bold">Settings</h1>
    <nav className="tabs tabs-border" aria-label="Settings sections">
      {[{ name: 'general', label: 'General' }, ...sections, { name: 'authentication', label: 'Authentication' }].map((section) => <button className={`tab ${tab === section.name ? 'tab-active' : ''}`} key={section.name} onClick={() => setParameters({ tab: section.name })}>{section.label}</button>)}
    </nav>
    {tab === 'authentication' ? <AuthenticationSettings initial={configuration} /> : <form className="card bg-base-100 p-6 space-y-5" onSubmit={(event) => { event.preventDefault(); action.run(saveConfiguration); }}>
      {current ? <SettingsField field={current} value={configuration[current.name]} onChange={(value) => setConfiguration({ ...configuration, [current.name]: value })} />
        : <SettingsObject fields={settingsFields.filter((field) => !sectionNames.includes(field.name))} value={configuration} onChange={setConfiguration} />}
      {tab === 'virtual_folders' ? arrayValue(configuration.virtual_folders).map((folder, index) => <VirtualFolderPreview key={index} folder={objectValue(folder)} />) : null}
      {tab === 'strm' ? <button type="button" className="btn btn-outline" disabled={action.isPending} onClick={() => action.run(async () => { await request('api/strm/regenerate', { method: 'POST' }); return 'STRM regeneration started in the background.'; })}>Regenerate STRM Files</button> : null}
      <div className="flex gap-3"><button className="btn btn-primary" disabled={action.isPending}>Save Configuration</button><button type="button" className="btn" onClick={() => { if (confirm('Discard unsaved changes?')) setConfiguration(savedConfiguration); }}>Reset Changes</button></div>
    </form>}
    <ActionMessage state={action.state} />
  </section>;
}
