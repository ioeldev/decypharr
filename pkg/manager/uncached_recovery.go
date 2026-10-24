package manager

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"

	"github.com/sirrobot01/appendstore"
	"github.com/sirrobot01/decypharr/internal/customerror"
	"github.com/sirrobot01/decypharr/internal/utils"
	"github.com/sirrobot01/decypharr/pkg/arr/reacquire"
	"github.com/sirrobot01/decypharr/pkg/debrid/common"
	debridTypes "github.com/sirrobot01/decypharr/pkg/debrid/types"
)

func (m *Manager) submitUncachedRecovery(ctx context.Context, request *ImportRequest) (result *debridTypes.Torrent, submissionErr error) {
	if m.arrService == nil {
		return nil, errors.New("recovery service unavailable")
	}
	job, found := m.arrService.Job(request.RecoveryJobID)
	if !found || job.Uncached == nil || job.Uncached.Phase != reacquire.UncachedSubmitting || job.Uncached.SelectedHash != strings.ToLower(request.Magnet.InfoHash) {
		return nil, errors.New("invalid uncached recovery authorization")
	}
	attempted := false
	defer func() {
		if submissionErr != nil && !attempted {
			submissionErr = errors.Join(submissionErr, m.arrService.RejectUncachedBeforeSubmission(job.ID, submissionErr))
		}
	}()
	if _, err := m.storage.Get(request.Magnet.InfoHash); err == nil {
		return nil, errors.New("recovery hash is already managed; ownership is shared")
	} else if !errors.Is(err, appendstore.ErrKeyNotFound) {
		return nil, err
	}
	clients := m.FilterDebrid(func(client common.Client) bool {
		return request.SelectedDebrid == "" || client.Config().Name == request.SelectedDebrid
	})
	if len(clients) == 0 {
		return nil, errors.New("no recovery provider available")
	}
	// Never move on to a second provider after an uncertain submission.
	client := clients[0]
	existing, err := recoveryInventory(ctx, client)
	if err != nil {
		return nil, fmt.Errorf("verify exclusive recovery ownership: %w", err)
	}
	for _, torrent := range existing {
		if torrent == nil || torrent.InfoHash == "" {
			return nil, errors.New("provider inventory has missing torrent identity")
		}
		if strings.EqualFold(torrent.InfoHash, request.Magnet.InfoHash) {
			return nil, errors.New("recovery hash already exists on provider; ownership is shared")
		}
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	submitter, supported := client.(interface {
		SubmitRecovery(context.Context, *debridTypes.Torrent) (*debridTypes.Torrent, error)
	})
	if !supported {
		return nil, errors.New("provider does not support single-attempt recovery submission")
	}
	attempted = true
	torrent, err := submitter.SubmitRecovery(ctx, &debridTypes.Torrent{InfoHash: request.Magnet.InfoHash, Magnet: request.Magnet, Name: request.Magnet.Name, DownloadUncached: true})
	if err != nil {
		if errors.Is(err, customerror.TooManyActiveDownloadsError) || errors.Is(err, customerror.TorrentBlockedError) {
			attempted = false
		}
		return nil, err
	}
	if torrent == nil || torrent.Id == "" {
		return nil, errors.New("provider returned no recovery placement")
	}
	for _, previous := range existing {
		if previous.Id == torrent.Id {
			return nil, errors.New("provider returned an existing placement")
		}
	}
	placement := reacquire.UncachedPlacement{
		JobID:               job.ID,
		Provider:            client.Config().Name,
		ProviderID:          torrent.Id,
		ProviderFingerprint: recoveryProviderFingerprint(client),
		Import: &reacquire.UncachedImport{
			DownloadFolder:  request.DownloadFolder,
			Action:          request.Action,
			SkipMultiSeason: request.SkipMultiSeason,
			CallbackURL:     request.CallBackUrl,
		},
	}
	if err := m.arrService.RecordUncachedPlacement(placement); err != nil {
		return nil, err
	}
	torrent.DownloadUncached = true
	checked, err := client.CheckStatus(torrent)
	if err != nil {
		// The placement is already owned. Keep it queued for observation rather
		// than resubmitting or discarding its identity after a status-check error.
		torrent.Status = debridTypes.TorrentStatusDownloading
		torrent.Debrid = client.Config().Name
		return torrent, nil
	}
	if checked == nil || checked.Id != torrent.Id {
		return nil, errors.New("provider changed recovery placement identity")
	}
	checked.DownloadUncached = true
	return checked, nil
}

func (m *Manager) ObserveUncached(ctx context.Context, job reacquire.Job) (reacquire.UncachedObservation, error) {
	fallback := job.Uncached
	if fallback == nil {
		return reacquire.UncachedObservation{}, errors.New("missing recovery placement")
	}
	client := m.ProviderClient(fallback.Provider)
	if client == nil {
		return reacquire.UncachedObservation{}, errors.New("recovery provider unavailable")
	}
	if fallback.ProviderFingerprint != recoveryProviderFingerprint(client) {
		return reacquire.UncachedObservation{}, errors.New("recovery provider account changed")
	}
	if err := ctx.Err(); err != nil {
		return reacquire.UncachedObservation{}, err
	}
	torrent, err := client.GetTorrent(fallback.ProviderID)
	if err != nil || torrent == nil {
		if fallback.Phase == reacquire.UncachedCleanup {
			absent, inventoryErr := recoveryPlacementAbsent(ctx, client, fallback.ProviderID)
			if inventoryErr == nil && absent {
				return reacquire.UncachedObservation{Missing: true}, nil
			}
		}
		return reacquire.UncachedObservation{}, fmt.Errorf("observe recovery placement: %w", err)
	}
	if torrent.Id != fallback.ProviderID || !strings.EqualFold(torrent.InfoHash, fallback.SelectedHash) {
		return reacquire.UncachedObservation{}, errors.New("recovery placement identity changed")
	}
	if fallback.Import != nil && fallback.Phase != reacquire.UncachedCleanup {
		if err := m.restoreUncachedQueue(job, torrent); err != nil {
			return reacquire.UncachedObservation{}, err
		}
	}
	observation := reacquire.UncachedObservation{Complete: torrent.Status == debridTypes.TorrentStatusDownloaded, Failed: torrent.Status == debridTypes.TorrentStatusError}
	if observation.Complete || observation.Failed {
		return observation, nil
	}
	if torrent.DownloadedBytes == nil || *torrent.DownloadedBytes < 0 {
		return observation, errors.New("provider does not expose downloaded bytes; cannot establish a safe stall")
	}
	observation.DownloadedBytes = *torrent.DownloadedBytes
	return observation, nil
}

func (m *Manager) CleanupUncached(ctx context.Context, job reacquire.Job) error {
	fallback := job.Uncached
	if fallback == nil || fallback.Phase != reacquire.UncachedCleanup {
		return errors.New("cleanup intent is required")
	}
	client := m.ProviderClient(fallback.Provider)
	if client == nil {
		return errors.New("recovery provider unavailable")
	}
	entry, err := m.queue.GetTorrent(fallback.SelectedHash)
	if err != nil && !errors.Is(err, appendstore.ErrKeyNotFound) {
		return err
	}
	if entry != nil {
		placement := entry.GetActiveProvider()
		if entry.Category != job.ArrName || len(entry.Providers) != 1 || entry.ActiveProvider != fallback.Provider || placement == nil || placement.ID != fallback.ProviderID {
			return errors.New("recovery placement is shared or has changed; cleanup refused")
		}
		if entry.Progress >= 1 || entry.Status == debridTypes.TorrentStatusDownloaded || entry.IsDownloading {
			return errors.New("recovery has entered local processing; cleanup refused")
		}
	}
	// Recheck immediately before deletion; a completed remote download must survive.
	observation, err := m.ObserveUncached(ctx, job)
	if err != nil {
		return err
	}
	if observation.Complete {
		return errors.New("recovery completed during cleanup")
	}
	if !observation.Missing {
		if err := client.DeleteTorrent(fallback.ProviderID); err != nil {
			return err
		}
	}
	absent, err := recoveryPlacementAbsent(ctx, client, fallback.ProviderID)
	if err != nil {
		return err
	}
	if !absent {
		return errors.New("remote recovery cleanup is not confirmed")
	}
	if entry != nil {
		return m.queue.Delete(fallback.SelectedHash, false, nil)
	}
	return nil
}

func recoveryPlacementAbsent(ctx context.Context, client common.Client, providerID string) (bool, error) {
	torrents, err := recoveryInventory(ctx, client)
	if err != nil {
		return false, err
	}
	for _, torrent := range torrents {
		if torrent == nil {
			return false, errors.New("incomplete provider inventory")
		}
		if torrent.Id == providerID {
			return false, nil
		}
	}
	return true, nil
}

func recoveryInventory(ctx context.Context, client common.Client) ([]*debridTypes.Torrent, error) {
	inventory, supported := client.(interface {
		RecoveryInventory(context.Context) ([]*debridTypes.Torrent, error)
	})
	if !supported {
		return nil, errors.New("provider does not support a complete recovery inventory")
	}
	return inventory.RecoveryInventory(ctx)
}

func recoveryProviderFingerprint(client common.Client) string {
	configuration := client.Config()
	return fmt.Sprintf("%x", sha256.Sum256([]byte(configuration.Provider+"\x00"+configuration.Name+"\x00"+configuration.APIKey)))
}

// Rebuild the local queue from the durable placement receipt after a crash
// between provider acceptance and queue persistence. Never resubmit the magnet.
func (m *Manager) restoreUncachedQueue(job reacquire.Job, torrent *debridTypes.Torrent) error {
	if _, err := m.queue.GetTorrent(job.Uncached.SelectedHash); err == nil {
		return nil
	} else if !errors.Is(err, appendstore.ErrKeyNotFound) {
		return err
	}
	instance, found := m.arr.Get(job.ArrName)
	if !found {
		return errors.New("recovery Arr no longer configured")
	}
	imported := job.Uncached.Import
	allowUncached := true
	request := NewTorrentRequest(job.Uncached.Provider, imported.DownloadFolder, utils.ConstructMagnet(job.Uncached.SelectedHash, torrent.Name), instance, imported.Action, &allowUncached, imported.CallbackURL, ImportTypeQBit, imported.SkipMultiSeason)
	entry := newTorrentQueueEntry(request, debridTypes.TorrentStatusDownloading)
	entry.DownloadUncached = true
	applyDebridTorrentToEntry(entry, torrent)
	return m.queue.Add(entry)
}
