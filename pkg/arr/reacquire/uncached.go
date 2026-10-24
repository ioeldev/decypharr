package reacquire

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
)

type UncachedPhase string

const (
	UncachedWaiting     UncachedPhase = "waiting_capacity"
	UncachedDispatching UncachedPhase = "dispatching"
	UncachedSubmitting  UncachedPhase = "submitting"
	UncachedDownloading UncachedPhase = "downloading"
	UncachedCleanup     UncachedPhase = "cleanup_pending"
	UncachedComplete    UncachedPhase = "complete"
)

type UncachedCandidate struct {
	Release arr.Release     `json:"release"`
	Payload json.RawMessage `json:"payload"`
	Hash    string          `json:"hash"`
}
type UncachedImport struct {
	DownloadFolder  string                `json:"downloadFolder"`
	Action          config.DownloadAction `json:"action"`
	SkipMultiSeason bool                  `json:"skipMultiSeason"`
	CallbackURL     string                `json:"callbackURL,omitempty"`
}
type UncachedRecovery struct {
	Import              *UncachedImport     `json:"import,omitempty"`
	Phase               UncachedPhase       `json:"phase"`
	Candidates          []UncachedCandidate `json:"candidates"`
	AttemptedHashes     []string            `json:"attemptedHashes,omitempty"`
	SelectedHash        string              `json:"selectedHash,omitempty"`
	Reserved            bool                `json:"reserved"`
	Provider            string              `json:"provider,omitempty"`
	ProviderID          string              `json:"providerId,omitempty"`
	ProviderFingerprint string              `json:"providerFingerprint,omitempty"`
	ProgressMetric      string              `json:"progressMetric,omitempty"`
	LastPercentage      float64             `json:"lastPercentage,omitempty"`
	LastBytes           int64               `json:"lastBytes"`
	LastProgressAt      time.Time           `json:"lastProgressAt,omitzero"`
	LastObservedAt      time.Time           `json:"lastObservedAt,omitzero"`
	DispatchedAt        time.Time           `json:"dispatchedAt,omitzero"`
}

type UncachedObservation struct {
	ProgressPercent *float64
	Missing         bool
	DownloadedBytes int64
	Complete        bool
	Failed          bool
}

// The backend must observe and remove only the recorded, exclusively owned placement.
type UncachedBackend interface {
	ObserveUncached(context.Context, Job) (UncachedObservation, error)
	CleanupUncached(context.Context, Job) error
}

func cloneUncached(fallback *UncachedRecovery) *UncachedRecovery {
	if fallback == nil {
		return nil
	}
	copy := *fallback
	if fallback.Import != nil {
		imported := *fallback.Import
		copy.Import = &imported
	}
	copy.AttemptedHashes = slices.Clone(fallback.AttemptedHashes)
	copy.Candidates = slices.Clone(fallback.Candidates)
	for index := range copy.Candidates {
		candidate := &copy.Candidates[index]
		candidate.Payload = slices.Clone(candidate.Payload)
		candidate.Release.Payload = slices.Clone(candidate.Release.Payload)
	}
	return &copy
}

// A successful search alone is insufficient: every eligible release must have
// an explicit, hash-bearing rejection from this recovery attempt.
func uncachedCandidates(job Job, releases []arr.Release) []UncachedCandidate {
	var seeded, unknown []UncachedCandidate
	seen := map[string]bool{}
	ordered := slices.Clone(releases)
	slices.SortStableFunc(ordered, func(left, right arr.Release) int {
		leftSeeded := left.Seeders != nil && *left.Seeders > 0
		rightSeeded := right.Seeders != nil && *right.Seeders > 0
		if leftSeeded == rightSeeded {
			return 0
		}
		if leftSeeded {
			return -1
		}
		return 1
	})
	for _, release := range ordered {
		if !releaseEligible(release) {
			continue
		}
		if release.GUID == "" || release.Indexer == "" || release.IndexerID <= 0 {
			return nil
		}
		mutation, found := mutationForKey(job, mutationKey(MutationReleaseGrab, release.GUID, fmt.Sprint(release.IndexerID)))
		hash := arr.NormalizeInfoHash(mutation.RejectionHash)
		if !found || mutation.State != MutationRejected || hash == "" {
			return nil
		}
		if release.InfoHash != "" && arr.NormalizeInfoHash(release.InfoHash) != hash {
			return nil
		}
		if release.Seeders != nil && *release.Seeders <= 0 {
			continue
		}
		if seen[hash] {
			continue
		}
		seen[hash] = true
		candidate := UncachedCandidate{Release: release, Payload: slices.Clone(release.Payload), Hash: hash}
		if release.Seeders == nil {
			unknown = append(unknown, candidate)
		} else {
			seeded = append(seeded, candidate)
		}
	}
	return append(seeded, unknown...)
}

func (s *Service) reserveUncached(job Job) (Job, bool, error) {
	s.uncachedMu.Lock()
	defer s.uncachedMu.Unlock()
	policy, err := config.Get().Repair.QueuePolicy()
	if err != nil {
		return job, false, err
	}
	if !policy.UncachedRecoveryFallback || policy.Paused || job.Paused {
		return job, false, nil
	}
	occupied := 0
	reservedHashes := map[string]bool{}
	for _, current := range s.Jobs() {
		if current.Uncached != nil && current.Uncached.Reserved {
			occupied++
			reservedHashes[current.Uncached.SelectedHash] = true
		}
	}
	if occupied >= policy.MaxUncachedRecoveries {
		return job, false, nil
	}
	waitingForHash := false
	for _, candidate := range job.Uncached.Candidates {
		if slices.Contains(job.Uncached.AttemptedHashes, candidate.Hash) {
			continue
		}
		if reservedHashes[candidate.Hash] {
			waitingForHash = true
			continue
		}
		reserved, err := s.updateObservedJob(job, StatusWaitingForDownload, func(current *Job) {
			current.Uncached.SelectedHash = candidate.Hash
			current.Uncached.AttemptedHashes = append(current.Uncached.AttemptedHashes, candidate.Hash)
			current.Uncached.Phase = UncachedDispatching
			current.Uncached.Reserved = true
			current.Uncached.DispatchedAt = s.now()
			current.LastError = ""
		})
		return reserved, err == nil, err
	}
	if waitingForHash {
		return job, false, nil
	}
	return job, false, errNoCachedReplacement
}

// ConsumeUncachedAuthorization is called only by the authenticated qBittorrent
// endpoint. Persist consumption before allowing any provider side effect.
func (s *Service) ConsumeUncachedAuthorization(instance arr.Arr, hash string) (string, error) {
	s.uncachedMu.Lock()
	defer s.uncachedMu.Unlock()
	if !config.Get().Repair.UncachedRecoveryFallback {
		return "", nil
	}
	if s.arrs == nil {
		return "", errors.New("Arr registry unavailable")
	}
	if _, authenticated := s.arrs.MatchCredentials(instance.Name, instance.Host, instance.Token); !authenticated {
		return "", errors.New("uncached recovery requires authenticated Arr credentials")
	}
	hash = arr.NormalizeInfoHash(hash)
	if hash == "" {
		return "", nil
	}
	for _, job := range s.Jobs() {
		fallback := job.Uncached
		if fallback == nil || !fallback.Reserved || fallback.SelectedHash != hash || job.ArrName != instance.Name {
			continue
		}
		if validateMutationInstance(instance, job.Bindings) != nil {
			return "", errors.New("uncached recovery Arr identity changed")
		}
		if fallback.Phase != UncachedDispatching {
			return "", errors.New("uncached recovery submission already consumed")
		}
		_, err := s.updateObservedJob(job, job.Status, func(current *Job) { current.Uncached.Phase = UncachedSubmitting })
		if err != nil {
			return "", err
		}
		return job.ID, nil
	}
	return "", nil
}

type UncachedPlacement struct {
	JobID, Provider, ProviderID, ProviderFingerprint string
	Import                                           *UncachedImport
}

func (s *Service) RecordUncachedPlacement(placement UncachedPlacement) error {
	jobID, provider, providerID := placement.JobID, placement.Provider, placement.ProviderID
	s.uncachedMu.Lock()
	defer s.uncachedMu.Unlock()
	job, found := s.Job(jobID)
	if !found || job.Uncached == nil || job.Uncached.Phase != UncachedSubmitting || provider == "" || providerID == "" {
		return errors.New("uncached recovery submission is no longer valid")
	}
	_, err := s.updateObservedJob(job, job.Status, func(current *Job) {
		if placement.Import != nil {
			imported := *placement.Import
			current.Uncached.Import = &imported
		}
		current.Uncached.Provider = provider
		current.Uncached.ProviderID = providerID
		current.Uncached.ProviderFingerprint = placement.ProviderFingerprint
		current.Uncached.Phase = UncachedDownloading
		current.Uncached.LastProgressAt = s.now()
	})
	return err
}

func (s *Service) OwnsUncachedHash(hash string) bool {
	for _, job := range s.Jobs() {
		if job.Uncached != nil && job.Uncached.Reserved && job.Uncached.SelectedHash == arr.NormalizeInfoHash(hash) {
			return true
		}
	}
	return false
}

func (s *Service) monitorUncached(ctx context.Context) {
	ticker := time.NewTicker(maintenanceInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		for _, job := range s.Jobs() {
			if job.Uncached == nil || job.Uncached.Phase == UncachedComplete || job.Status == StatusNeedsAttention {
				continue
			}
			if err := s.reconcileUncached(ctx, job); err != nil {
				current, found := s.Job(job.ID)
				if found {
					_, _ = s.updateObservedJob(current, current.Status, func(next *Job) { next.ObservationError = err.Error() })
				}
			}
		}
	}
}

func (s *Service) reconcileUncached(ctx context.Context, job Job) error {
	if s.uncachedBackend == nil {
		return errors.New("uncached recovery backend unavailable")
	}
	if job.Uncached.Phase == UncachedWaiting {
		reserved, available, err := s.reserveUncached(job)
		if errors.Is(err, errNoCachedReplacement) {
			cleared, updateErr := s.updateObservedJob(job, job.Status, func(current *Job) { current.Uncached = nil })
			if updateErr != nil {
				return updateErr
			}
			return s.scheduleRecovery(cleared, "cache_miss", "Uncached candidates exhausted")
		}
		if err != nil || !available {
			return err
		}
		return s.dispatchUncached(ctx, reserved)
	}
	if job.Uncached.Phase == UncachedDispatching || job.Uncached.Phase == UncachedSubmitting {
		return s.attention(job, "Uncached dispatch outcome is uncertain; reservation retained for reconciliation")
	}
	observation, err := s.uncachedBackend.ObserveUncached(ctx, job)
	if err != nil {
		return err
	}
	if observation.Complete {
		return s.completeUncached(job)
	}
	if job.Uncached.Phase == UncachedCleanup {
		return s.cleanupUncached(ctx, job)
	}
	policy, err := config.Get().Repair.QueuePolicy()
	if err != nil {
		return err
	}
	// A reset counter needs a fresh baseline; it cannot prove a stall.
	progressMetric := ""
	percentage := float64(0)
	progressChanged := observation.DownloadedBytes != job.Uncached.LastBytes
	if observation.ProgressPercent != nil {
		progressMetric = "percentage"
		percentage = *observation.ProgressPercent
		progressChanged = percentage != job.Uncached.LastPercentage
	}
	progressed := job.Uncached.LastObservedAt.IsZero() || progressMetric != job.Uncached.ProgressMetric || progressChanged
	updated, err := s.updateObservedJob(job, job.Status, func(current *Job) {
		current.Uncached.LastObservedAt = s.now()
		current.ObservationError = ""
		if progressed {
			current.Uncached.LastProgressAt = s.now()
			current.Uncached.LastBytes = observation.DownloadedBytes
			current.Uncached.ProgressMetric = progressMetric
			current.Uncached.LastPercentage = percentage
		}
	})
	if err != nil {
		return err
	}
	if !observation.Failed && (progressed || s.now().Sub(updated.Uncached.LastProgressAt) < policy.UncachedStallTimeout) {
		return nil
	}
	cleanup, err := s.updateObservedJob(updated, updated.Status, func(current *Job) { current.Uncached.Phase = UncachedCleanup })
	if err != nil {
		return err
	}
	return s.cleanupUncached(ctx, cleanup)
}

func (s *Service) dispatchUncached(ctx context.Context, job Job) error {
	instance, found := s.arrs.Get(job.ArrName)
	if !found || validateMutationInstance(instance, job.Bindings) != nil {
		return s.attention(job, "Uncached recovery Arr identity changed")
	}
	for _, candidate := range job.Uncached.Candidates {
		if candidate.Hash != job.Uncached.SelectedHash {
			continue
		}
		release := candidate.Release
		release.Payload = candidate.Payload
		dispatchCtx, cancel := context.WithTimeout(ctx, executionTimeout)
		err := s.arrs.GrabRelease(dispatchCtx, instance.Name, release)
		cancel()
		current, _ := s.Job(job.ID)
		if current.Uncached.Phase == UncachedDownloading || current.Uncached.Phase == UncachedWaiting {
			return nil
		}
		if current.Uncached.Phase == UncachedDispatching && errors.Is(err, arr.ErrReleaseNotCached) {
			_, updateErr := s.updateObservedJob(current, current.Status, func(next *Job) {
				next.Uncached.Phase = UncachedWaiting
				next.Uncached.Reserved = false
				next.LastError = err.Error()
			})
			return updateErr
		}
		if err == nil {
			err = errors.New("Arr accepted release without an owned uncached placement")
		}
		return s.attention(current, "Uncached dispatch needs attention: "+err.Error())
	}
	return s.attention(job, "Selected uncached release is missing")
}

func (s *Service) completeUncached(job Job) error {
	_, err := s.updateObservedJob(job, StatusWaitingForDownload, func(current *Job) {
		current.Uncached.Phase = UncachedComplete
		current.Uncached.Reserved = false
		current.ReplacementDownloadID = current.Uncached.SelectedHash
		current.ReplacementDownloadIDs = []string{current.Uncached.SelectedHash}
		current.DownloadProgressAt = s.now()
		current.ObservationError = ""
	})
	return err
}

func (s *Service) cleanupUncached(ctx context.Context, job Job) error {
	imported, err := s.jobImported(ctx, job)
	if err != nil {
		return err
	}
	if imported {
		return s.attention(job, "Library files were imported while the owned fallback remains incomplete; reservation retained for review")
	}
	observation, err := s.uncachedBackend.ObserveUncached(ctx, job)
	if err != nil {
		return err
	}
	if observation.Complete {
		return s.completeUncached(job)
	}
	if err := s.validateUncachedQueueCleanup(ctx, job); err != nil {
		return err
	}
	if err := s.uncachedBackend.CleanupUncached(ctx, job); err != nil {
		return err
	}
	if err := s.arrs.RemoveRecoveryQueue(ctx, job.ArrName, job.Uncached.SelectedHash); err != nil {
		return err
	}
	_, err = s.updateObservedJob(job, StatusWaitingForDownload, func(current *Job) {
		current.Uncached.Phase = UncachedWaiting
		current.Uncached.Reserved = false
		current.Uncached.Import = nil
		current.Uncached.Provider = ""
		current.Uncached.ProviderID = ""
		current.Uncached.ProviderFingerprint = ""
		current.Uncached.LastBytes = 0
		current.Uncached.LastObservedAt = time.Time{}
		current.Uncached.LastProgressAt = time.Time{}
		current.ObservationError = ""
	})
	return err
}

func (s *Service) validateUncachedQueueCleanup(ctx context.Context, job Job) error {
	for _, instance := range s.arrs.All() {
		records, err := s.arrs.Queue(ctx, instance.Name)
		if err != nil {
			return err
		}
		for _, record := range records {
			if arr.NormalizeInfoHash(record.DownloadId) != job.Uncached.SelectedHash {
				continue
			}
			if instance.Name != job.ArrName || !matchesMedia(job, record.MovieId, record.SeriesId, record.EpisodeId, record.SeasonNumber) {
				return errors.New("recovery download is shared with another Arr target")
			}
			if record.EpisodeHasFile || strings.Contains(strings.ToLower(record.TrackedDownloadState), "import") || strings.EqualFold(record.Status, "completed") {
				return errors.New("recovery entered completion/import during cleanup")
			}
		}
	}
	return nil
}

func validateUncached(fallback *UncachedRecovery) error {
	if fallback == nil {
		return nil
	}
	switch fallback.Phase {
	case UncachedWaiting, UncachedComplete:
		if fallback.Reserved {
			return errors.New("inactive uncached phase cannot hold capacity")
		}
	case UncachedDispatching, UncachedSubmitting, UncachedDownloading, UncachedCleanup:
		if !fallback.Reserved || arr.NormalizeInfoHash(fallback.SelectedHash) == "" || fallback.DispatchedAt.IsZero() {
			return errors.New("active uncached phase requires a durable reservation and identity")
		}
	default:
		return errors.New("invalid uncached recovery phase")
	}
	if fallback.Phase == UncachedDownloading || fallback.Phase == UncachedCleanup {
		if fallback.Provider == "" || fallback.ProviderID == "" {
			return errors.New("uncached download requires owned placement")
		}
	}
	if len(fallback.Candidates) == 0 {
		return errors.New("uncached candidates are required")
	}
	for _, candidate := range fallback.Candidates {
		if arr.NormalizeInfoHash(candidate.Hash) != candidate.Hash || candidate.Hash == "" || !json.Valid(candidate.Payload) {
			return errors.New("invalid uncached candidate identity or payload")
		}
	}
	return nil
}

// RejectUncachedBeforeSubmission releases capacity only when the backend has
// established that no provider submission was attempted.
func (s *Service) RejectUncachedBeforeSubmission(jobID string, reason error) error {
	s.uncachedMu.Lock()
	defer s.uncachedMu.Unlock()
	job, found := s.Job(jobID)
	if !found || job.Uncached == nil || job.Uncached.Phase != UncachedSubmitting || job.Uncached.ProviderID != "" {
		return errors.New("cannot prove an unsubmitted recovery")
	}
	_, err := s.updateObservedJob(job, job.Status, func(current *Job) {
		current.Uncached.Phase = UncachedWaiting
		current.Uncached.Reserved = false
		current.LastError = reason.Error()
	})
	return err
}
