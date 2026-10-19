import { expect, test } from 'bun:test';
import { isCommonSetting, isRelevantSetting } from './settings-visibility';

test('everyday connection fields remain visible while tuning is advanced', () => {
  expect(isCommonSetting('', 'download_folder')).toBe(true);
  expect(isCommonSetting('', 'bind_address')).toBe(false);
  expect(isCommonSetting('debrids', 'api_key')).toBe(true);
  expect(isCommonSetting('debrids', 'workers')).toBe(false);
  expect(isCommonSetting('usenet.providers', 'password')).toBe(true);
  expect(isCommonSetting('usenet', 'socket_read_buffer')).toBe(false);
});

test('disabled services retain their activation controls, including inverted Hearsay activation', () => {
  for (const path of ['nfs', 'smb', 'strm', 'share_cache', 'repair', 'notifications']) {
    expect(isRelevantSetting({ path: path, name: 'enabled', value: {}, configuration: {} })).toBe(
      true,
    );
    expect(isRelevantSetting({ path: path, name: 'port', value: {}, configuration: {} })).toBe(
      false,
    );
    expect(
      isRelevantSetting({ path: path, name: 'port', value: { enabled: true }, configuration: {} }),
    ).toBe(true);
  }
  expect(
    isRelevantSetting({
      path: 'hearsay',
      name: 'disabled',
      value: { disabled: true },
      configuration: {},
    }),
  ).toBe(true);
  expect(
    isRelevantSetting({
      path: 'hearsay',
      name: 'port',
      value: { disabled: true },
      configuration: {},
    }),
  ).toBe(false);
  expect(isRelevantSetting({ path: 'hearsay', name: 'port', value: {}, configuration: {} })).toBe(
    true,
  );
});

test('only the selected mount backend is relevant', () => {
  for (const type of ['dfs', 'rclone', 'external_rclone', 'none', '']) {
    expect(
      isRelevantSetting({ path: 'mount', name: 'type', value: { type }, configuration: {} }),
    ).toBe(true);
    for (const backend of ['dfs', 'rclone', 'external_rclone']) {
      expect(
        isRelevantSetting({ path: 'mount', name: backend, value: { type }, configuration: {} }),
      ).toBe(type === backend);
    }
    expect(
      isRelevantSetting({ path: 'mount', name: 'mount_path', value: { type }, configuration: {} }),
    ).toBe(['dfs', 'rclone'].includes(type));
  }
  expect(
    isRelevantSetting({ path: 'mount.rclone', name: 'enabled', value: {}, configuration: {} }),
  ).toBe(false);
});

test('dependent services appear as soon as the unsaved configuration activates them', () => {
  expect(isRelevantSetting({ path: '', name: 'share_cache', value: {}, configuration: {} })).toBe(
    false,
  );
  expect(
    isRelevantSetting({
      path: '',
      name: 'share_cache',
      value: {},
      configuration: { smb: { enabled: true } },
    }),
  ).toBe(true);
  expect(
    isRelevantSetting({ path: 'usenet', name: 'providers', value: {}, configuration: {} }),
  ).toBe(true);
  expect(
    isRelevantSetting({ path: 'usenet', name: 'read_ahead', value: {}, configuration: {} }),
  ).toBe(false);
  expect(
    isRelevantSetting({
      path: 'usenet',
      name: 'read_ahead',
      value: {},
      configuration: { usenet: { providers: [{}] } },
    }),
  ).toBe(true);
  expect(
    isRelevantSetting({
      path: 'repair',
      name: 'nntp_connection_percent',
      value: { enabled: true },
      configuration: {},
    }),
  ).toBe(false);
  expect(
    isRelevantSetting({
      path: 'repair',
      name: 'queue_max_active',
      value: { enabled: true },
      configuration: {},
    }),
  ).toBe(false);
  expect(
    isRelevantSetting({
      path: 'repair',
      name: 'queue_max_active',
      value: { enabled: true },
      configuration: { arrs: [{}] },
    }),
  ).toBe(true);
  expect(
    isRelevantSetting({
      path: 'strm',
      name: 'sidecar_max_size',
      value: {
        enabled: true,
        download_sidecars: false,
      },
      configuration: {},
    }),
  ).toBe(false);
});
