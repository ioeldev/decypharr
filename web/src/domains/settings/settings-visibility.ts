import { createContext } from 'react';
import { arrayValue, objectValue, type JsonObject } from '../../shared/api/json-response';

export const SettingsDisplayContext = createContext<{
  configuration: JsonObject;
  showAdvanced: boolean;
}>({ configuration: {}, showAdvanced: false });

// Connection details and everyday choices stay visible. Tuning remains available
// through the advanced view; visibility never changes the configuration payload.
const commonFields: Record<string, readonly string[]> = {
  '': ['download_folder', 'default_download_action', 'disable_webdav', 'log_level', 'categories'],
  debrids: ['provider', 'name', 'api_key', 'download_uncached'],
  arrs: ['name', 'host', 'token', 'browser_url', 'selected_debrid', 'skip_repair'],
  usenet: ['providers'],
  'usenet.providers': ['host', 'port', 'username', 'password', 'ssl', 'max_connections', 'backup'],
  mount: ['type', 'mount_path', 'dfs', 'rclone', 'external_rclone'],
  'mount.dfs': ['cache_dir', 'disk_cache_size'],
  'mount.rclone': ['cache_dir', 'vfs_cache_mode', 'vfs_cache_max_size'],
  'mount.external_rclone': ['rc_url', 'rc_username', 'rc_password'],
  nfs: ['enabled', 'allowed_networks'],
  smb: ['enabled', 'share_name', 'username', 'password', 'allowed_networks'],
  share_cache: ['enabled', 'dir', 'max_size'],
  repair: [
    'enabled',
    'source',
    'schedule',
    'arrs',
    'auto_repair',
    'uncached_recovery_fallback',
    'max_uncached_recoveries',
    'uncached_stall_timeout',
    'library_audit',
    'scheduled_full_audit',
  ],
  strm: ['enabled', 'path', 'delivery_mode'],
  hearsay: ['disabled', 'participate', 'publish', 'advice_mode'],
  notifications: ['enabled', 'webhook_url', 'events'],
};

export function isCommonSetting(path: string, name: string): boolean {
  return commonFields[path]?.includes(name) ?? true;
}

export function isRelevantSetting({
  path,
  name,
  value,
  configuration,
}: {
  path: string;
  name: string;
  value: JsonObject;
  configuration: JsonObject;
}): boolean {
  const hasUsenet = arrayValue(objectValue(configuration.usenet).providers).length > 0;
  const hasArrs = arrayValue(configuration.arrs).length > 0;

  if (path === '') {
    if (name === 'share_cache')
      return Boolean(
        objectValue(configuration.nfs).enabled || objectValue(configuration.smb).enabled,
      );
    if (name === 'queue_cleanup') return hasArrs;
    if (name === 'nzb_user_agent') return hasUsenet;
  }

  if (['nfs', 'smb', 'share_cache', 'strm', 'notifications', 'repair'].includes(path)) {
    if (name === 'enabled') return true;
    if (!value.enabled) return false;
  }

  if (path === 'hearsay') return name === 'disabled' || value.disabled !== true;
  if (path === 'usenet') return name === 'providers' || hasUsenet;
  if (path === 'strm' && name === 'sidecar_max_size') return value.download_sidecars !== false;
  if (path === 'mount') {
    if (name === 'type') return true;
    if (name === 'mount_path') return ['dfs', 'rclone'].includes(String(value.type));
    return name === value.type;
  }

  // mount.type is the current activation control; the nested enabled flag is legacy.
  if (path === 'mount.rclone' && name === 'enabled') return false;
  if (path === 'repair') {
    if (name === 'nntp_connection_percent') return hasUsenet;
    if (
      name === 'arrs' ||
      name === 'strategy' ||
      name === 'replace_whole_season' ||
      name === 'uncached_recovery_fallback' ||
      name === 'max_uncached_recoveries' ||
      name === 'uncached_stall_timeout' ||
      name === 'library_audit' ||
      name === 'scheduled_full_audit' ||
      name.startsWith('queue_')
    )
      return hasArrs;
  }
  if (path === 'arrs' && ['selected_debrid', 'download_uncached'].includes(name))
    return arrayValue(configuration.debrids).length > 0;

  return true;
}
