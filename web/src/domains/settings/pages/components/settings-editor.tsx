import { Checkbox } from '@/shared/components/ui/checkbox';
import { Field, FieldLabel, FieldDescription } from '@/shared/components/ui/field';
import { SettingsDisplayContext, isRelevantSetting } from '../../settings-visibility';
import PageHeader from '@/shared/components/page-header';
import { FieldGroup } from '@/shared/components/ui/field';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import {
  CardHeader,
  CardTitle,
  CardDescription,
  Card,
  CardContent,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { statisticsKeys } from '../../../statistics/statistics.queries';
import { configurationQuery, settingsKeys } from '../../settings.queries';
import { libraryKeys } from '../../../library/library.queries';
import { repairKeys } from '../../../repair/repair.queries';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { request, requestJson } from '../../../../shared/api/client';
import {
  arrayValue,
  jsonObjectSchema,
  objectValue,
  type JsonObject,
} from '../../../../shared/api/json-response';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ActionMessage from '../../../../shared/components/action-message';
import { settingsFields } from '../../settings.fields';
import SettingsObject from './settings-object';
import SettingsField from './settings-field';
import AuthenticationSettings from './authentication-settings';
import VirtualFolderPreview from './virtual-folder-preview';

const sectionNames = [
  'debrids',
  'arrs',
  'usenet',
  'mount',
  'nfs',
  'smb',
  'share_cache',
  'repair',
  'virtual_folders',
  'strm',
  'hearsay',
  'notifications',
  'queue_cleanup',
];
export default function SettingsEditor({ initial }: { initial: JsonObject }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [draft, setDraft] = useState<JsonObject | null>(null);
  const configuration = draft ?? initial;
  const [parameters, setParameters] = useSearchParams();
  const requestedTab = parameters.get('tab') ?? 'general';
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (operation: () => Promise<string>) => operation(),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
        queryClient.invalidateQueries({ queryKey: repairKeys.all }),
        queryClient.invalidateQueries({ queryKey: statisticsKeys.all }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
      ]),
  });
  const sections = settingsFields.filter(
    (field) =>
      sectionNames.includes(field.name) &&
      isRelevantSetting({
        path: '',
        name: field.name,
        value: configuration,
        configuration,
      }),
  );
  const tab = ['general', 'authentication', ...sections.map((section) => section.name)].includes(
    requestedTab,
  )
    ? requestedTab
    : 'general';
  const current = sections.find((field) => field.name === tab);
  function saveConfiguration(): Promise<string> {
    const {
      session_secret,
      api_token,
      auth_username,
      auth_token_only,
      use_auth,
      enable_webdav_auth,
      ...editable
    } = configuration;
    void session_secret;
    void api_token;
    void auth_username;
    void auth_token_only;
    void use_auth;
    void enable_webdav_auth;
    return requestJson('api/config', { method: 'POST', json: editable })
      .then(jsonObjectSchema.parse)
      .then((response) => {
        queryClient.setQueryData(configurationQuery().queryKey, configuration);
        setDraft((current) => (current === configuration ? null : current));
        return response.restarted
          ? 'Configuration saved. Services are restarting; refresh once the server is ready.'
          : 'Configuration saved.';
      });
  }
  return (
    <SettingsDisplayContext value={{ configuration, showAdvanced }}>
      <section className="flex flex-col gap-5">
        <PageHeader
          title="Settings"
          description="Connect your services and make Decypharr work for you."
        />
        <Field orientation="horizontal">
          <Checkbox
            id="show-advanced-settings"
            checked={showAdvanced}
            onCheckedChange={(checked) => setShowAdvanced(checked === true)}
            aria-describedby="settings-view-description"
          />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="show-advanced-settings">Show advanced settings</FieldLabel>
            <FieldDescription id="settings-view-description">
              Common settings are shown by default. Hidden values are preserved when you save.
            </FieldDescription>
          </div>
        </Field>
        <nav aria-label="Settings sections" className="min-w-0 overflow-x-auto pb-1">
          <Tabs value={tab} onValueChange={(section) => setParameters({ tab: section })}>
            <TabsList>
              {[
                { name: 'general', label: 'General' },
                ...sections,
                { name: 'authentication', label: 'Authentication' },
              ].map((section) => (
                <TabsTrigger value={section.name} key={section.name}>
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </nav>
        {tab === 'authentication' ? (
          <AuthenticationSettings initial={configuration} />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              action.mutate(saveConfiguration);
            }}
            className="flex flex-col gap-5"
          >
            <FieldGroup>
              <Card>
                <CardHeader>
                  <CardTitle>{current?.label ?? 'General'}</CardTitle>
                  <CardDescription>
                    {showAdvanced
                      ? 'Common and advanced settings for your active services.'
                      : 'Common settings. Enable a service to reveal its options.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex min-w-0 flex-col gap-4">
                  {current ? (
                    <SettingsField
                      field={current}
                      value={configuration[current.name]}
                      onChange={(value) => setDraft({ ...configuration, [current.name]: value })}
                    />
                  ) : (
                    <SettingsObject
                      fields={settingsFields.filter((field) => !sectionNames.includes(field.name))}
                      value={configuration}
                      onChange={setDraft}
                    />
                  )}
                  {tab === 'virtual_folders'
                    ? arrayValue(configuration.virtual_folders).map((folder, index) => (
                        <VirtualFolderPreview key={index} folder={objectValue(folder)} />
                      ))
                    : null}
                  {tab === 'strm' && Boolean(objectValue(configuration.strm).enabled) ? (
                    <Button
                      type="button"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate(async () => {
                          await request('api/strm/regenerate', {
                            method: 'POST',
                          });
                          return 'STRM regeneration started in the background.';
                        })
                      }
                      variant="outline"
                    >
                      Regenerate STRM Files
                    </Button>
                  ) : null}
                  <div className="flex gap-3 flex-wrap">
                    <Button disabled={action.isPending} variant="default">
                      Save Configuration
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        if (confirm('Discard unsaved changes?')) setDraft(null);
                      }}
                      variant="secondary"
                    >
                      Reset Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </FieldGroup>
          </form>
        )}
        <ActionMessage state={action} />
      </section>
    </SettingsDisplayContext>
  );
}
