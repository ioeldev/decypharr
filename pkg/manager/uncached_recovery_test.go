package manager

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/puzpuzpuz/xsync/v4"
	"github.com/rs/zerolog"
	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
	"github.com/sirrobot01/decypharr/pkg/arr/reacquire"
	"github.com/sirrobot01/decypharr/pkg/debrid/common"
	"github.com/sirrobot01/decypharr/pkg/debrid/providers/alldebrid"
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

func TestUncachedPercentageObservation(t *testing.T) {
	manager, provider, job := recoveryManagerFixture(t)
	provider.torrent.DownloadedBytes = nil
	for _, percentage := range []float64{0, 12.5, 100, -1, 101} {
		provider.torrent.RemoteProgressPercent = &percentage
		observation, err := manager.ObserveUncached(t.Context(), job)
		if percentage < 0 || percentage > 100 {
			if err == nil {
				t.Fatal("accepted invalid percentage")
			}
			continue
		}
		if err != nil || observation.ProgressPercent == nil || *observation.ProgressPercent != percentage {
			t.Fatalf("percentage=%v observation=%+v err=%v", percentage, observation, err)
		}
	}
}

func TestAllDebridRecoveryCleanupConfirmsRemoteRemoval(t *testing.T) {
	for _, retain := range []bool{false, true} {
		t.Run(fmt.Sprintf("retain=%v", retain), func(t *testing.T) {
			manager, _, job := recoveryManagerFixture(t)
			var deleted atomic.Bool
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/magnet/delete" {
					if r.URL.Query().Get("id") != "42" {
						t.Error("wrong deletion identity")
					}
					if !retain {
						deleted.Store(true)
					}
					fmt.Fprint(w, `{"status":"success"}`)
					return
				}
				if deleted.Load() {
					fmt.Fprint(w, `{"status":"success","data":{"magnets":[]}}`)
					return
				}
				fmt.Fprintf(w, `{"status":"success","data":{"magnets":[{"id":42,"hash":"%s","statusCode":7,"downloaded":123}]}}`, job.Uncached.SelectedHash)
			}))
			defer server.Close()
			provider, err := alldebrid.New(config.Debrid{Name: "provider", Provider: "alldebrid"}, nil)
			if err != nil {
				t.Fatal(err)
			}
			provider.Host = server.URL
			manager.clients.Store("provider", provider)
			job.Uncached.ProviderID = "42"
			job.Uncached.ProviderFingerprint = recoveryProviderFingerprint(provider)
			observation, err := manager.ObserveUncached(t.Context(), job)
			if err != nil || !observation.Failed {
				t.Fatalf("observation=%+v err=%v", observation, err)
			}
			err = manager.CleanupUncached(t.Context(), job)
			if (err != nil) != retain {
				t.Fatalf("cleanup err=%v retain=%v", err, retain)
			}
		})
	}
}
