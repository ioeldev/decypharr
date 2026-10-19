package manager

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/puzpuzpuz/xsync/v4"
	"github.com/rs/zerolog"
	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
	debrid "github.com/sirrobot01/decypharr/pkg/debrid/common"
	"github.com/sirrobot01/decypharr/pkg/debrid/types"
	"github.com/sirrobot01/decypharr/pkg/notifications"
	"github.com/sirrobot01/decypharr/pkg/storage"
)

func TestQueuedTorrentAppliesCompletedProviderFilesBeforeImport(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		t.Run(map[bool]string{false: "uncached download", true: "legacy empty completion"}[legacy], func(t *testing.T) {
			config.Reset()
			config.SetConfigPath(t.TempDir())
			t.Cleanup(config.Reset)
			cfg := config.Get()
			cfg.Mount.MountPath = t.TempDir()
			cfg.SkipPreCache = true
			store, err := storage.NewStorage(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			m := &Manager{storage: store, queue: newQueue(store, ""), config: cfg, ctx: t.Context(), logger: zerolog.Nop(), arr: arr.New(), clients: xsync.NewMap[string, debrid.Client](), processingEntries: xsync.NewMap[string, struct{}](), Notifications: notifications.New(&cfg.Notifications, zerolog.Nop())}
			m.initEntryCache()
			m.downloader = NewDownloadManager(m)
			entry := &storage.Entry{InfoHash: "0123456789012345678901234567890123456789", Name: "Movie.mkv", Category: "radarr", Protocol: config.ProtocolTorrent, State: storage.EntryStateDownloading, Status: types.TorrentStatusDownloading, Action: config.DownloadActionSymlink, SavePath: t.TempDir(), ActiveProvider: "alldebrid", Files: map[string]*storage.File{}, Providers: map[string]*storage.ProviderEntry{"alldebrid": {Provider: "alldebrid", ID: "123", Files: map[string]*storage.ProviderFile{}}}}
			torrent := &types.Torrent{Id: "123", InfoHash: entry.InfoHash, Debrid: "alldebrid", Name: entry.Name, Status: types.TorrentStatusDownloaded, Progress: 100, Bytes: 5, Files: map[string]types.File{"Movie.mkv": {Name: "Movie.mkv", Id: "0", Size: 5, Link: "provider-link", Path: "Movie.mkv"}}}
			m.clients.Store("alldebrid", completedTorrentProvider{torrent: torrent})
			if legacy {
				entry.MarkAsCompleted(entry.DownloadPath())
			}
			if err := m.queue.Add(entry); err != nil {
				t.Fatal(err)
			}
			if legacy {
				m.restoreEmptyCompletedImports()
				entry, err = m.queue.GetTorrent(entry.InfoHash)
				if err != nil || entry.IsComplete || entry.State != storage.EntryStateDownloading {
					t.Fatalf("not restored: %+v %v", entry, err)
				}
			}
			mount := m.GetTorrentMountPath(entry)
			if err := os.MkdirAll(mount, 0755); err != nil {
				t.Fatal(err)
			}
			target := filepath.Join(mount, "Movie.mkv")
			if err := os.WriteFile(target, []byte("media"), 0644); err != nil {
				t.Fatal(err)
			}
			m.processQueuedTorrent(entry)
			saved, err := m.queue.GetTorrent(entry.InfoHash)
			if err != nil || !saved.IsComplete || saved.State != storage.EntryStatePausedUP {
				t.Fatalf("not completed: %+v %v", saved, err)
			}
			if len(saved.Files) != 1 || saved.GetActiveProvider().Files["Movie.mkv"].Link != "provider-link" {
				t.Fatalf("missing metadata: %+v", saved)
			}
			link := filepath.Join(saved.DownloadPath(), "Movie.mkv")
			got, err := os.Readlink(link)
			if err != nil || got != target {
				t.Fatalf("symlink=%q err=%v", got, err)
			}
			data, err := os.ReadFile(link)
			if err != nil || string(data) != "media" {
				t.Fatalf("Arr cannot read import file: %q %v", data, err)
			}
		})
	}
}

func TestSymlinkImportRejectsEmptyOrDeletedFiles(t *testing.T) {
	for _, deleted := range []bool{false, true} {
		t.Run(map[bool]string{false: "empty metadata", true: "all deleted"}[deleted], func(t *testing.T) {
			entry := &storage.Entry{Name: "Movie", SavePath: t.TempDir(), Files: map[string]*storage.File{}}
			if deleted {
				entry.Files["Movie.mkv"] = &storage.File{Name: "Movie.mkv", Deleted: true}
			}
			d := &Downloader{logger: zerolog.Nop()}
			if err := d.processSymlink(entry, t.TempDir()); err == nil {
				t.Fatal("empty import reported as complete")
			}
			if entry.IsComplete {
				t.Fatal("empty import marked complete")
			}
			if _, err := os.Lstat(entry.DownloadPath()); !os.IsNotExist(err) {
				t.Fatalf("empty staging folder created: %v", err)
			}
		})
	}
}

func TestMetadataRefreshPreservesDeletedFiles(t *testing.T) {
	entry := &storage.Entry{Files: map[string]*storage.File{"Movie.mkv": {Name: "Movie.mkv", Deleted: true}}}
	applyDebridTorrentToEntry(entry, &types.Torrent{Debrid: "alldebrid", Status: types.TorrentStatusDownloaded, Files: map[string]types.File{"Movie.mkv": {Name: "Movie.mkv", Size: 42}}})
	if len(entry.GetActiveFiles()) != 0 {
		t.Fatal("refresh resurrected explicitly deleted file")
	}
}

func TestRestoreEmptyImportsLeavesOtherCompletedJobsAlone(t *testing.T) {
	store, err := storage.NewStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	m := &Manager{queue: newQueue(store, ""), ctx: t.Context(), logger: zerolog.Nop()}
	for _, name := range []string{"metadata", "deleted", "download", "none", "nzb", "no-provider"} {
		entry := &storage.Entry{InfoHash: name, Name: name, Category: "radarr", Protocol: config.ProtocolTorrent, Action: config.DownloadActionSymlink, SavePath: t.TempDir(), Files: map[string]*storage.File{}, ActiveProvider: "alldebrid", Providers: map[string]*storage.ProviderEntry{"alldebrid": {Provider: "alldebrid", ID: "123"}}}
		switch name {
		case "metadata":
			entry.Files["movie"] = &storage.File{Name: "movie"}
		case "deleted":
			entry.Files["movie"] = &storage.File{Name: "movie", Deleted: true}
		case "download":
			entry.Action = config.DownloadActionDownload
		case "none":
			entry.Action = config.DownloadActionNone
		case "nzb":
			entry.Protocol = config.ProtocolNZB
		case "no-provider":
			entry.Providers = nil
		}
		entry.MarkAsCompleted(entry.DownloadPath())
		if err := m.queue.Add(entry); err != nil {
			t.Fatal(err)
		}
	}
	m.restoreEmptyCompletedImports()
	for _, name := range []string{"metadata", "deleted", "download", "none", "nzb", "no-provider"} {
		e, err := m.queue.GetTorrent(name)
		if err != nil || !e.IsComplete || e.State != storage.EntryStatePausedUP || e.CompletedAt == nil || time.Since(*e.CompletedAt) > time.Minute {
			t.Fatalf("changed unrelated completed import %s: %+v %v", name, e, err)
		}
	}
}
