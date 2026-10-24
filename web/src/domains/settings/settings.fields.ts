import type { SettingsField } from './settings.types';

// Editable configuration fields mirror the Go configuration contracts.
export const settingsFields: SettingsField[] = [
  {
    "name": "bind_address",
    "label": "Bind Address",
    "kind": "text"
  },
  {
    "name": "url_base",
    "label": "URL Base",
    "kind": "text"
  },
  {
    "name": "app_url",
    "label": "Application URL",
    "kind": "text"
  },
  {
    "name": "port",
    "label": "Port",
    "kind": "text"
  },
  {
    "name": "log_level",
    "label": "Log Level",
    "kind": "choice",
    "options": [
      "debug",
      "info",
      "warn",
      "error"
    ]
  },
  {
    "name": "debrids",
    "label": "Debrid Providers",
    "kind": "list",
    "item": {
      "name": "item",
      "label": "Item",
      "kind": "object",
      "fields": [
        {
          "name": "provider",
          "label": "Provider",
          "description": "realdebrid, alldebrid, debridlink, torbox, premiumize",
          "kind": "choice",
          "options": [
            "realdebrid",
            "alldebrid",
            "debridlink",
            "torbox",
            "premiumize"
          ]
        },
        {
          "name": "name",
          "label": "Name",
          "kind": "text"
        },
        {
          "name": "api_key",
          "label": "API Key",
          "kind": "text",
          "isSecret": true
        },
        {
          "name": "download_api_keys",
          "label": "Download API Keys",
          "kind": "list",
          "item": {
            "name": "item",
            "label": "Item",
            "kind": "text",
            "isSecret": true
          }
        },
        {
          "name": "download_uncached",
          "label": "Download Uncached",
          "kind": "boolean"
        },
        {
          "name": "rate_limit",
          "label": "Rate Limit",
          "description": "200/minute or 10/second",
          "kind": "text"
        },
        {
          "name": "repair_rate_limit",
          "label": "Repair Rate Limit",
          "kind": "text"
        },
        {
          "name": "download_rate_limit",
          "label": "Download Rate Limit",
          "kind": "text"
        },
        {
          "name": "proxy",
          "label": "Proxy",
          "kind": "text"
        },
        {
          "name": "unpack_rar",
          "label": "Unpack Rar",
          "kind": "boolean"
        },
        {
          "name": "minimum_free_slot",
          "label": "Minimum Free Slot",
          "description": "Minimum active pots to use this debrid",
          "kind": "number"
        },
        {
          "name": "limit",
          "label": "Limit",
          "description": "Maximum number of total torrents",
          "kind": "number"
        },
        {
          "name": "torrents_refresh_interval",
          "label": "Torrents Refresh Interval",
          "kind": "text"
        },
        {
          "name": "download_links_refresh_interval",
          "label": "Download Links Refresh Interval",
          "kind": "text"
        },
        {
          "name": "workers",
          "label": "Workers",
          "kind": "number"
        },
        {
          "name": "auto_expire_links_after",
          "label": "Auto Expire Links After",
          "kind": "text"
        },
        {
          "name": "user_agent",
          "label": "User Agent",
          "kind": "text"
        }
      ]
    }
  },
  {
    "name": "arrs",
    "label": "Arr Applications",
    "kind": "list",
    "item": {
      "name": "item",
      "label": "Item",
      "kind": "object",
      "fields": [
        {
          "name": "browser_url",
          "label": "Browser Url",
          "kind": "text"
        },
        {
          "name": "name",
          "label": "Name",
          "kind": "text"
        },
        {
          "name": "host",
          "label": "Host",
          "kind": "text"
        },
        {
          "name": "token",
          "label": "Token",
          "kind": "text",
          "isSecret": true
        },
        {
          "name": "skip_repair",
          "label": "Skip Repair",
          "kind": "boolean"
        },
        {
          "name": "download_uncached",
          "label": "Download Uncached",
          "kind": "boolean",
          "isOptional": true
        },
        {
          "name": "selected_debrid",
          "label": "Selected Debrid",
          "kind": "text"
        },
        {
          "name": "source",
          "label": "Source",
          "description": "The source of the arr, e.g. \"auto\", \"config\", \"\". Auto means it was automatically detected from the arr",
          "kind": "text"
        }
      ]
    }
  },
  {
    "name": "usenet",
    "label": "Usenet",
    "description": "Usenet configuration",
    "kind": "object",
    "fields": [
      {
        "name": "providers",
        "label": "Providers",
        "description": "Usenet provider configurations",
        "kind": "list",
        "item": {
          "name": "item",
          "label": "Item",
          "kind": "object",
          "fields": [
            {
              "name": "host",
              "label": "Host",
              "description": "Host of the usenet server",
              "kind": "text"
            },
            {
              "name": "port",
              "label": "Port",
              "description": "Port of the usenet server",
              "kind": "number"
            },
            {
              "name": "username",
              "label": "Username",
              "kind": "text"
            },
            {
              "name": "password",
              "label": "Password",
              "kind": "text",
              "isSecret": true
            },
            {
              "name": "backbone",
              "label": "Backbone",
              "description": "Shared article backbone identifier used for failover decisions",
              "kind": "text"
            },
            {
              "name": "max_connections",
              "label": "Max Connections",
              "description": "Max connections for this provider (default: 10)",
              "kind": "number"
            },
            {
              "name": "ssl",
              "label": "Use TLS",
              "description": "Use SSL/TLS for the connection",
              "kind": "boolean"
            },
            {
              "name": "priority",
              "label": "Priority",
              "description": "Priority for this provider (lower = higher priority)",
              "kind": "number"
            },
            {
              "name": "backup",
              "label": "Backup",
              "kind": "boolean"
            }
          ]
        }
      },
      {
        "name": "max_connections",
        "label": "Max Connections",
        "description": "Provider-wide streaming fetch limit (default: 15)",
        "kind": "number"
      },
      {
        "name": "processing_max_connections",
        "label": "Processing Max Connections",
        "description": "Maximum concurrent connections per file for parsing and NZB downloads (default: max_connections)",
        "kind": "number"
      },
      {
        "name": "read_ahead",
        "label": "Read Ahead",
        "description": "Bytes to prefetch ahead of streaming reads e.g. \"16MB\", \"32MB\" (default: 16MB)",
        "kind": "text"
      },
      {
        "name": "body_pipeline_depth",
        "label": "Body Pipeline Depth",
        "description": "Speculative BODY commands sent per connection (1 disables, default: 2, max: 4)",
        "kind": "number"
      },
      {
        "name": "stream_backup_wait",
        "label": "Stream Backup Wait",
        "kind": "text"
      },
      {
        "name": "socket_read_buffer",
        "label": "Socket Read Buffer",
        "kind": "text"
      },
      {
        "name": "socket_write_buffer",
        "label": "Socket Write Buffer",
        "kind": "text"
      },
      {
        "name": "processing_timeout",
        "label": "Processing Timeout",
        "description": "Timeout for NZB processing e.g. \"5m\", \"10m\" (default: 10m). Mark as bad if exceeded.",
        "kind": "text"
      },
      {
        "name": "conn_idle_timeout",
        "label": "Conn Idle Timeout",
        "kind": "text"
      },
      {
        "name": "availability_sample_percent",
        "label": "Availability Sample Percent",
        "description": "Percentage of segments to check during repair (1-100, default: 10)",
        "kind": "number"
      },
      {
        "name": "import_availability_sample_percent",
        "label": "Import Availability Sample Percent",
        "description": "Percentage of segments to check when adding an NZB (1-100, default: 1)",
        "kind": "number"
      },
      {
        "name": "disk_path",
        "label": "Disk Path",
        "kind": "text"
      },
      {
        "name": "buffer_memory",
        "label": "Buffer Memory",
        "kind": "text"
      }
    ]
  },
  {
    "name": "mount",
    "label": "Mount",
    "kind": "object",
    "fields": [
      {
        "name": "type",
        "label": "Type",
        "kind": "choice",
        "options": [
          "none",
          "dfs",
          "rclone",
          "external_rclone"
        ]
      },
      {
        "name": "mount_path",
        "label": "Mount Path",
        "kind": "text"
      },
      {
        "name": "rclone",
        "label": "Rclone",
        "kind": "object",
        "fields": [
          {
            "name": "enabled",
            "label": "Enabled",
            "kind": "boolean"
          },
          {
            "name": "mount_path",
            "label": "Mount Path",
            "kind": "text"
          },
          {
            "name": "port",
            "label": "Port",
            "kind": "text"
          },
          {
            "name": "cache_dir",
            "label": "Cache Dir",
            "kind": "text"
          },
          {
            "name": "vfs_cache_mode",
            "label": "Vfs Cache Mode",
            "description": "off, minimal, writes, full",
            "kind": "choice",
            "options": [
              "off",
              "minimal",
              "writes",
              "full"
            ]
          },
          {
            "name": "vfs_cache_max_age",
            "label": "Vfs Cache Max Age",
            "description": "Maximum age of objects in the cache (default 1h)",
            "kind": "text"
          },
          {
            "name": "vfs_disk_space_total",
            "label": "Vfs Disk Space Total",
            "description": "Total disk space available for the cache (default off)",
            "kind": "text"
          },
          {
            "name": "vfs_cache_max_size",
            "label": "Vfs Cache Max Size",
            "description": "Maximum size of the cache (default off)",
            "kind": "text"
          },
          {
            "name": "vfs_cache_poll_interval",
            "label": "Vfs Cache Poll Interval",
            "description": "How often to poll for changes (default 1m)",
            "kind": "text"
          },
          {
            "name": "vfs_read_chunk_size",
            "label": "Vfs Read Chunk Size",
            "description": "Read chunk size (default 128M)",
            "kind": "text"
          },
          {
            "name": "vfs_read_chunk_size_limit",
            "label": "Vfs Read Chunk Size Limit",
            "description": "Max chunk size (default off)",
            "kind": "text"
          },
          {
            "name": "vfs_read_ahead",
            "label": "Vfs Read Ahead",
            "description": "read ahead size",
            "kind": "text"
          },
          {
            "name": "buffer_size",
            "label": "Buffer Size",
            "description": "Buffer size for reading files (default 16M)",
            "kind": "text"
          },
          {
            "name": "bw_limit",
            "label": "Bw Limit",
            "description": "Bandwidth limit (default off)",
            "kind": "text"
          },
          {
            "name": "vfs_cache_min_free_space",
            "label": "Vfs Cache Min Free Space",
            "kind": "text"
          },
          {
            "name": "vfs_fast_fingerprint",
            "label": "Vfs Fast Fingerprint",
            "kind": "boolean"
          },
          {
            "name": "vfs_read_chunk_streams",
            "label": "Vfs Read Chunk Streams",
            "kind": "number"
          },
          {
            "name": "async_read",
            "label": "Async Read",
            "description": "Use async read for files",
            "kind": "boolean",
            "isOptional": true
          },
          {
            "name": "transfers",
            "label": "Transfers",
            "description": "Number of transfers to use (default 4)",
            "kind": "number"
          },
          {
            "name": "use_mmap",
            "label": "Use Mmap",
            "kind": "boolean"
          },
          {
            "name": "uid",
            "label": "User ID",
            "description": "User ID for mounted files",
            "kind": "number"
          },
          {
            "name": "gid",
            "label": "Group ID",
            "description": "Group ID for mounted files",
            "kind": "number"
          },
          {
            "name": "umask",
            "label": "Umask",
            "kind": "text"
          },
          {
            "name": "attr_timeout",
            "label": "Attr Timeout",
            "description": "Attribute cache timeout (default 1s)",
            "kind": "text"
          },
          {
            "name": "dir_cache_time",
            "label": "Dir Cache Time",
            "description": "Directory cache time (default 5m)",
            "kind": "text"
          },
          {
            "name": "no_modtime",
            "label": "No Modtime",
            "description": "Don't read/write modification time",
            "kind": "boolean"
          },
          {
            "name": "no_checksum",
            "label": "No Checksum",
            "description": "Don't checksum files on upload",
            "kind": "boolean"
          },
          {
            "name": "log_level",
            "label": "Log Level",
            "kind": "text"
          }
        ]
      },
      {
        "name": "dfs",
        "label": "Dfs",
        "kind": "object",
        "fields": [
          {
            "name": "cache_expiry",
            "label": "Cache Expiry",
            "description": "1h, 30m etc",
            "kind": "text"
          },
          {
            "name": "cache_dir",
            "label": "Cache Dir",
            "description": "/tmp/decypharr-cache",
            "kind": "text"
          },
          {
            "name": "disk_cache_size",
            "label": "Disk Cache Size",
            "description": "10GB, 50GB etc",
            "kind": "text"
          },
          {
            "name": "cache_cleanup_interval",
            "label": "Cache Cleanup Interval",
            "description": "10m, 1h etc",
            "kind": "text"
          },
          {
            "name": "buffer_memory",
            "label": "Buffer Memory",
            "kind": "text"
          },
          {
            "name": "chunk_size",
            "label": "Chunk Size",
            "description": "Initial chunk size, e.g 10MB",
            "kind": "text"
          },
          {
            "name": "drop_behind_margin",
            "label": "Drop Behind Margin",
            "kind": "text"
          },
          {
            "name": "daemon_timeout",
            "label": "Daemon Timeout",
            "description": "Time after which the FUSE daemon will exit if idle",
            "kind": "text"
          },
          {
            "name": "fuse_max_background",
            "label": "Fuse Max Background",
            "kind": "number"
          },
          {
            "name": "fuse_max_read_ahead",
            "label": "Fuse Max Read Ahead",
            "kind": "text"
          },
          {
            "name": "uid",
            "label": "User ID",
            "description": "User ID for mounted files",
            "kind": "number"
          },
          {
            "name": "gid",
            "label": "Group ID",
            "description": "Group ID for mounted files",
            "kind": "number"
          },
          {
            "name": "umask",
            "label": "Umask",
            "description": "File permissions mask",
            "kind": "text"
          }
        ]
      },
      {
        "name": "external_rclone",
        "label": "External Rclone",
        "kind": "object",
        "fields": [
          {
            "name": "rc_url",
            "label": "Rc Url",
            "kind": "text"
          },
          {
            "name": "rc_username",
            "label": "Rc Username",
            "kind": "text"
          },
          {
            "name": "rc_password",
            "label": "Rc Password",
            "kind": "text",
            "isSecret": true
          }
        ]
      }
    ]
  },
  {
    "name": "nfs",
    "label": "NFS",
    "kind": "object",
    "fields": [
      {
        "name": "enabled",
        "label": "Enabled",
        "kind": "boolean"
      },
      {
        "name": "bind_address",
        "label": "Bind Address",
        "kind": "text"
      },
      {
        "name": "port",
        "label": "Port",
        "kind": "number"
      },
      {
        "name": "allowed_networks",
        "label": "Allowed Networks",
        "kind": "list",
        "item": {
          "name": "item",
          "label": "Item",
          "kind": "text"
        }
      }
    ]
  },
  {
    "name": "smb",
    "label": "SMB",
    "kind": "object",
    "fields": [
      {
        "name": "enabled",
        "label": "Enabled",
        "kind": "boolean"
      },
      {
        "name": "bind_address",
        "label": "Bind Address",
        "kind": "text"
      },
      {
        "name": "port",
        "label": "Port",
        "kind": "number"
      },
      {
        "name": "share_name",
        "label": "Share Name",
        "kind": "text"
      },
      {
        "name": "username",
        "label": "Username",
        "kind": "text"
      },
      {
        "name": "password",
        "label": "Password",
        "kind": "text",
        "isSecret": true
      },
      {
        "name": "require_signing",
        "label": "Require Signing",
        "kind": "boolean"
      },
      {
        "name": "allowed_networks",
        "label": "Allowed Networks",
        "kind": "list",
        "item": {
          "name": "item",
          "label": "Item",
          "kind": "text"
        }
      }
    ]
  },
  {
    "name": "share_cache",
    "label": "Shared File Cache",
    "description": "Read cache shared by the NFS and SMB exports",
    "kind": "object",
    "fields": [
      {
        "name": "enabled",
        "label": "Enabled",
        "kind": "boolean",
        "isOptional": true
      },
      {
        "name": "dir",
        "label": "Dir",
        "kind": "text"
      },
      {
        "name": "max_size",
        "label": "Max Size",
        "kind": "text"
      },
      {
        "name": "max_age",
        "label": "Max Age",
        "kind": "text"
      },
      {
        "name": "chunk_size",
        "label": "Chunk Size",
        "kind": "text"
      },
      {
        "name": "read_ahead",
        "label": "Read Ahead",
        "kind": "text"
      }
    ]
  },
  {
    "name": "allowed_file_types",
    "label": "Allowed File Types",
    "kind": "list",
    "item": {
      "name": "item",
      "label": "Item",
      "kind": "text"
    }
  },
  {
    "name": "allow_samples",
    "label": "Allow Samples",
    "kind": "boolean"
  },
  {
    "name": "min_file_size",
    "label": "Min File Size",
    "kind": "text"
  },
  {
    "name": "max_file_size",
    "label": "Max File Size",
    "kind": "text"
  },
  {
    "name": "remove_stalled_after",
    "label": "Remove Stalled After",
    "kind": "text"
  },
  {
    "name": "nzb_user_agent",
    "label": "NZB User Agent",
    "description": "User agent for downloading NZBs",
    "kind": "text"
  },
  {
    "name": "disable_webdav",
    "label": "Disable Webdav",
    "kind": "boolean"
  },
  {
    "name": "notifications",
    "label": "Notifications",
    "kind": "object",
    "fields": [
      {
        "name": "enabled",
        "label": "Enabled",
        "kind": "boolean"
      },
      {
        "name": "webhook_url",
        "label": "Webhook Url",
        "kind": "text"
      },
      {
        "name": "callback_url",
        "label": "Callback Url",
        "kind": "text"
      },
      {
        "name": "events",
        "label": "Events",
        "kind": "list",
        "item": {
          "name": "item",
          "label": "Item",
          "kind": "choice",
          "options": [
            "download_complete",
            "download_failed",
            "repair_pending",
            "repair_complete",
            "repair_failed",
            "repair_cancelled"
          ]
        }
      }
    ]
  },
  {
    "name": "download_folder",
    "label": "Download Folder",
    "kind": "text"
  },
  {
    "name": "refresh_interval",
    "label": "Refresh Interval",
    "kind": "text"
  },
  {
    "name": "max_active_downloads",
    "label": "Max Active Downloads",
    "kind": "number"
  },
  {
    "name": "skip_pre_cache",
    "label": "Skip Pre Cache",
    "kind": "boolean"
  },
  {
    "name": "skip_multi_season",
    "label": "Skip Multi Season",
    "kind": "boolean"
  },
  {
    "name": "always_rm_tracker_urls",
    "label": "Always Remove Tracker URLs",
    "kind": "boolean"
  },
  {
    "name": "categories",
    "label": "Categories",
    "kind": "list",
    "item": {
      "name": "item",
      "label": "Item",
      "kind": "text"
    }
  },
  {
    "name": "folder_naming",
    "label": "Folder Naming",
    "kind": "choice",
    "options": [
      "filename",
      "original",
      "filename_no_ext",
      "original_no_ext",
      "infohash"
    ]
  },
  {
    "name": "virtual_folders",
    "label": "Virtual Folders",
    "kind": "list",
    "item": {
      "name": "item",
      "label": "Item",
      "kind": "object",
      "fields": [
        {
          "name": "name",
          "label": "Name",
          "kind": "text"
        },
        {
          "name": "match",
          "label": "Match",
          "kind": "choice",
          "options": [
            "all",
            "any"
          ]
        },
        {
          "name": "include_bad",
          "label": "Include Bad",
          "kind": "boolean"
        },
        {
          "name": "conditions",
          "label": "Conditions",
          "kind": "list",
          "item": {
            "name": "item",
            "label": "Item",
            "kind": "object",
            "fields": [
              {
                "name": "field",
                "label": "Field",
                "kind": "choice",
                "options": [
                  "entry_name",
                  "file_name",
                  "size",
                  "added",
                  "file_count",
                  "protocol",
                  "provider",
                  "category"
                ]
              },
              {
                "name": "operator",
                "label": "Operator",
                "kind": "choice",
                "options": [
                  "contains",
                  "not_contains",
                  "starts_with",
                  "not_starts_with",
                  "ends_with",
                  "not_ends_with",
                  "equals",
                  "not_equals",
                  "matches_regex",
                  "not_matches_regex",
                  "greater_than",
                  "less_than",
                  "within_last"
                ]
              },
              {
                "name": "value",
                "label": "Value",
                "kind": "text"
              },
              {
                "name": "case_sensitive",
                "label": "Case Sensitive",
                "kind": "boolean"
              }
            ]
          }
        }
      ]
    }
  },
  {
    "name": "default_download_action",
    "label": "Default Download Action",
    "kind": "choice",
    "options": [
      "symlink",
      "download",
      "none"
    ]
  },
  {
    "name": "refresh_dirs",
    "label": "Refresh Dirs",
    "kind": "text"
  },
  {
    "name": "retries",
    "label": "Retries",
    "kind": "number"
  },
  {
    "name": "skip_auto_move",
    "label": "Skip Auto Move",
    "kind": "boolean"
  },
  {
    "name": "repair",
    "label": "Repair",
    "kind": "object",
    "fields": [
      {
        "name": "enabled",
        "label": "Enabled",
        "kind": "boolean"
      },
      {
        "name": "source",
        "label": "Source",
        "kind": "choice",
        "options": [
          "arr",
          "managed"
        ]
      },
      {
        "name": "schedule",
        "label": "Schedule",
        "kind": "text"
      },
      {
        "name": "workers",
        "label": "Workers",
        "kind": "number"
      },
      {
        "name": "nntp_connection_percent",
        "label": "NNTP Connection Percent",
        "kind": "number"
      },
      {
        "name": "strategy",
        "label": "Strategy",
        "kind": "choice",
        "options": [
          "history_failed",
          "interactive_best",
          "command_search",
          "season_pack_first"
        ]
      },
      {
        "name": "recheck_interval",
        "label": "Recheck Interval",
        "kind": "text"
      },
      {
        "name": "arrs",
        "label": "Arr Applications",
        "kind": "list",
        "item": {
          "name": "item",
          "label": "Item",
          "kind": "text"
        }
      },
      {
        "name": "auto_repair",
        "label": "Auto Repair",
        "kind": "boolean"
      },
      {
        "name": "uncached_recovery_fallback",
        "label": "Uncached Recovery Fallback",
        "description": "After all eligible releases are explicitly rejected as uncached, try an uncached replacement. Off by default; applies only to cached-only Arr repair jobs.",
        "kind": "boolean"
      },
      {
        "name": "max_uncached_recoveries",
        "label": "Maximum Uncached Recoveries",
        "description": "Server-wide limit. Default: 1. Reservations awaiting cleanup or reconciliation also count.",
        "kind": "number"
      },
      {
        "name": "uncached_stall_timeout",
        "label": "Uncached Stall Timeout",
        "description": "Time without observed byte progress before safe cleanup. Default: 2h. Requires a provider byte counter; progressing downloads have no total time limit.",
        "kind": "text"
      },
      {
        "name": "replace_whole_season",
        "label": "Replace Whole Season",
        "kind": "boolean"
      },
      {
        "name": "scheduled_full_audit",
        "label": "Scheduled Full Audit",
        "kind": "boolean"
      },
      {
        "name": "library_audit",
        "label": "Library Audit",
        "kind": "boolean"
      },
      {
        "name": "queue_interval",
        "label": "Queue Interval",
        "kind": "text"
      },
      {
        "name": "queue_batch_size",
        "label": "Queue Batch Size",
        "kind": "number"
      },
      {
        "name": "queue_batch_pause",
        "label": "Queue Batch Pause",
        "kind": "text"
      },
      {
        "name": "queue_search_workers",
        "label": "Queue Search Workers",
        "kind": "number"
      },
      {
        "name": "queue_max_active",
        "label": "Queue Max Active",
        "kind": "number"
      },
      {
        "name": "queue_search_timeout",
        "label": "Queue Search Timeout",
        "kind": "text"
      },
      {
        "name": "queue_search_grace",
        "label": "Queue Search Grace",
        "kind": "text"
      },
      {
        "name": "queue_retry_delays",
        "label": "Queue Retry Delays",
        "kind": "text"
      },
      {
        "name": "queue_paused",
        "label": "Queue Paused",
        "kind": "boolean"
      },
      {
        "name": "verify_content",
        "label": "Verify Content",
        "kind": "boolean"
      },
      {
        "name": "stop_schedule",
        "label": "Stop Schedule",
        "kind": "text"
      }
    ]
  },
  {
    "name": "strm",
    "label": "STRM",
    "kind": "object",
    "fields": [
      {
        "name": "enabled",
        "label": "Enabled",
        "kind": "boolean"
      },
      {
        "name": "path",
        "label": "Path",
        "kind": "text"
      },
      {
        "name": "secret",
        "label": "Secret",
        "kind": "text",
        "isSecret": true
      },
      {
        "name": "delivery_mode",
        "label": "Delivery Mode",
        "kind": "choice",
        "options": [
          "proxy",
          "redirect"
        ]
      },
      {
        "name": "keep_media_extension",
        "label": "Keep Media Extension",
        "kind": "boolean"
      },
      {
        "name": "download_sidecars",
        "label": "Download Sidecars",
        "kind": "boolean",
        "isOptional": true
      },
      {
        "name": "sidecar_max_size",
        "label": "Sidecar Max Size",
        "kind": "text"
      }
    ]
  },
  {
    "name": "hearsay",
    "label": "Hearsay",
    "kind": "object",
    "fields": [
      {
        "name": "disabled",
        "label": "Disabled",
        "kind": "boolean"
      },
      {
        "name": "participate",
        "label": "Participate",
        "kind": "boolean",
        "isOptional": true
      },
      {
        "name": "publish",
        "label": "Publish",
        "kind": "boolean",
        "isOptional": true
      },
      {
        "name": "advice_mode",
        "label": "Advice Mode",
        "kind": "choice",
        "options": [
          "shadow",
          "active"
        ]
      },
      {
        "name": "min_support",
        "label": "Min Support",
        "kind": "number"
      },
      {
        "name": "min_evidence",
        "label": "Min Evidence",
        "kind": "number"
      },
      {
        "name": "min_sources",
        "label": "Min Sources",
        "kind": "number"
      },
      {
        "name": "port",
        "label": "Port",
        "kind": "number"
      },
      {
        "name": "gossip_port",
        "label": "Gossip Port",
        "kind": "number"
      },
      {
        "name": "interval",
        "label": "Interval",
        "kind": "text"
      },
      {
        "name": "max_storage_bytes",
        "label": "Max Storage Bytes",
        "kind": "number"
      },
      {
        "name": "max_feeds_per_namespace",
        "label": "Max Feeds Per Namespace",
        "kind": "number"
      },
      {
        "name": "max_seeded_torrents",
        "label": "Max Seeded Torrents",
        "kind": "number"
      },
      {
        "name": "follow",
        "label": "Follow",
        "kind": "list",
        "item": {
          "name": "item",
          "label": "Item",
          "kind": "text"
        }
      },
      {
        "name": "block_private_peers",
        "label": "Block Private Peers",
        "kind": "boolean"
      },
      {
        "name": "blocklist",
        "label": "Blocklist",
        "kind": "list",
        "item": {
          "name": "item",
          "label": "Item",
          "kind": "text"
        }
      }
    ]
  },
  {
    "name": "queue_cleanup",
    "label": "Queue Cleanup",
    "kind": "object",
    "fields": [
      {
        "name": "rules",
        "label": "Rules",
        "kind": "list",
        "item": {
          "name": "item",
          "label": "Item",
          "kind": "object",
          "fields": [
            {
              "name": "id",
              "label": "Id",
              "description": "catalog key; \"\" = user custom rule",
              "kind": "text"
            },
            {
              "name": "match",
              "label": "Match",
              "description": "custom: substring; catalog: display text",
              "kind": "text"
            },
            {
              "name": "action",
              "label": "Action",
              "description": "\"\" (ignore) | \"import\" | \"blacklist\" | \"blacklist_research\"",
              "kind": "choice",
              "options": [
                "",
                "import",
                "blacklist",
                "blacklist_research"
              ]
            }
          ]
        }
      }
    ]
  }
];
