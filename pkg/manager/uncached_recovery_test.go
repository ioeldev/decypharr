package manager

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/puzpuzpuz/xsync/v4"
	"github.com/rs/zerolog"
	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
	"github.com/sirrobot01/decypharr/pkg/arr/reacquire"
	"github.com/sirrobot01/decypharr/pkg/debrid/common"
	"github.com/sirrobot01/decypharr/pkg/debrid/types"
	"github.com/sirrobot01/decypharr/pkg/storage"
)

type ownedRecoveryProvider struct {
	common.Client
	torrent         *types.Torrent
	inventory       []*types.Torrent
	observationErr  error
	deletionErr     error
	deletions       int
	keepAfterDelete bool
}

func (provider *ownedRecoveryProvider) GetTorrent(string) (*types.Torrent, error) {
	return provider.torrent, provider.observationErr
}
func (provider *ownedRecoveryProvider) GetTorrents() ([]*types.Torrent, error) {
	return provider.inventory, nil
}
func (provider *ownedRecoveryProvider) DeleteTorrent(string) error {
	provider.deletions++
	if provider.deletionErr != nil {
		return provider.deletionErr
	}
	if !provider.keepAfterDelete {
		provider.inventory = nil
		provider.torrent = nil
	}
	return nil
}

func recoveryManagerFixture(t *testing.T) (*Manager, *ownedRecoveryProvider, reacquire.Job) {
	t.Helper()
	store, err := storage.NewStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	downloaded := int64(123)
	torrent := &types.Torrent{Id: "owned", InfoHash: strings.Repeat("a", 40), Status: types.TorrentStatusDownloading, DownloadedBytes: &downloaded}
	provider := &ownedRecoveryProvider{torrent: torrent, inventory: []*types.Torrent{torrent}}
	manager := &Manager{storage: store, queue: newQueue(store, ""), clients: xsync.NewMap[string, common.Client](), logger: zerolog.Nop()}
	manager.clients.Store("provider", provider)
	job := reacquire.Job{ArrName: "movies", Uncached: &reacquire.UncachedRecovery{Phase: reacquire.UncachedCleanup, Reserved: true, Provider: "provider", ProviderID: "owned", SelectedHash: torrent.InfoHash}}
	job.Uncached.ProviderFingerprint = recoveryProviderFingerprint(provider)
	return manager, provider, job
}

func TestUncachedObservationRequiresExactIdentityAndBytes(t *testing.T) {
	manager, provider, job := recoveryManagerFixture(t)
	observation, err := manager.ObserveUncached(t.Context(), job)
	if err != nil || observation.DownloadedBytes != 123 {
		t.Fatalf("observation=%+v err=%v", observation, err)
	}
	provider.torrent.InfoHash = strings.Repeat("b", 40)
	if _, err := manager.ObserveUncached(t.Context(), job); err == nil {
		t.Fatal("accepted changed hash")
	}
	provider.torrent.InfoHash = job.Uncached.SelectedHash
	provider.torrent.DownloadedBytes = nil
	if _, err := manager.ObserveUncached(t.Context(), job); err == nil {
		t.Fatal("inferred byte progress")
	}
	provider.torrent.Status = types.TorrentStatusDownloaded
	if observation, err := manager.ObserveUncached(t.Context(), job); err != nil || !observation.Complete {
		t.Fatal("completion required byte counter")
	}
}

func TestUncachedCleanupOwnershipAndConfirmation(t *testing.T) {
	for _, scenario := range []string{"shared", "completed", "delete_failed", "unconfirmed", "success", "restart_after_delete"} {
		t.Run(scenario, func(t *testing.T) {
			manager, provider, job := recoveryManagerFixture(t)
			switch scenario {
			case "shared":
				entry := &storage.Entry{InfoHash: job.Uncached.SelectedHash, Category: "other", Protocol: config.ProtocolTorrent, Status: types.TorrentStatusDownloading, ActiveProvider: "provider", Providers: map[string]*storage.ProviderEntry{"provider": {ID: "owned"}}}
				if err := manager.queue.Add(entry); err != nil {
					t.Fatal(err)
				}
			case "completed":
				provider.torrent.Status = types.TorrentStatusDownloaded
			case "delete_failed":
				provider.deletionErr = errors.New("unavailable")
			case "unconfirmed":
				provider.keepAfterDelete = true
			case "restart_after_delete":
				provider.torrent = nil
				provider.inventory = nil
				provider.observationErr = errors.New("not found")
			}
			err := manager.CleanupUncached(t.Context(), job)
			wantSuccess := scenario == "success" || scenario == "restart_after_delete"
			if (err == nil) != wantSuccess {
				t.Fatalf("cleanup error=%v", err)
			}
			if (scenario == "shared" || scenario == "completed" || scenario == "restart_after_delete") && provider.deletions != 0 {
				t.Fatal("deleted unowned or completed placement")
			}
		})
	}
}

func (provider *ownedRecoveryProvider) RecoveryInventory(context.Context) ([]*types.Torrent, error) {
	return provider.inventory, nil
}

func (provider *ownedRecoveryProvider) Config() config.Debrid {
	return config.Debrid{Name: "provider", Provider: "torbox", APIKey: "test"}
}

func TestRestoreOwnedQueueDoesNotResubmit(t *testing.T) {
	manager, provider, job := recoveryManagerFixture(t)
	manager.arr = arr.New()
	manager.arr.AddOrUpdate(arr.Arr{Name: job.ArrName, Host: "http://arr.test", Token: "test", Type: arr.Radarr})
	job.Uncached.Import = &reacquire.UncachedImport{DownloadFolder: t.TempDir(), Action: config.DownloadActionSymlink}
	job.Uncached.Phase = reacquire.UncachedDownloading
	provider.torrent.Debrid = "provider"
	if _, err := manager.ObserveUncached(t.Context(), job); err != nil {
		t.Fatal(err)
	}
	entry, err := manager.queue.GetTorrent(job.Uncached.SelectedHash)
	if err != nil {
		t.Fatal(err)
	}
	if !entry.DownloadUncached || entry.GetActiveProvider() == nil || entry.GetActiveProvider().ID != "owned" || entry.Category != job.ArrName {
		t.Fatalf("restored entry=%+v", entry)
	}
}
