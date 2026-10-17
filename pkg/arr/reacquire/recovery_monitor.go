package reacquire

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
)

func (j Job) newDispatch() bool {
	return j.Status == StatusRetryScheduled || (j.Status == StatusQueued && j.StartedAt.IsZero())
}
func (j Job) occupiesSlot() bool {
	return !j.Status.Terminal() && j.Status != StatusNeedsAttention && !j.newDispatch()
}
func attemptStart(j Job) time.Time {
	if !j.AttemptStartedAt.IsZero() {
		return j.AttemptStartedAt
	}
	if !j.StartedAt.IsZero() {
		return j.StartedAt
	}
	return j.CreatedAt
}
func phaseStart(j Job) time.Time {
	if j.DownloadProgressAt.After(j.PhaseStartedAt) {
		return j.DownloadProgressAt
	}
	if !j.PhaseStartedAt.IsZero() {
		return j.PhaseStartedAt
	}
	return j.UpdatedAt
}

// Runs independently of interactive searches. It only observes remote state;
// conditional updates prevent stale observations from overwriting new actions.
func (s *Service) monitorRecoveries(ctx context.Context) {
	ticker := time.NewTicker(maintenanceInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		s.reconcileSearchJobs(ctx)
		s.maintainJobs()
		s.signal()
	}
}

func (s *Service) observationJobs() []Job {
	jobs := slices.DeleteFunc(s.Jobs(), func(j Job) bool {
		return !j.Status.waiting() && j.Status != StatusRetryScheduled && j.Status != StatusNeedsAttention
	})
	slices.SortFunc(jobs, func(a, b Job) int {
		if c := a.LastObservationAttemptAt.Compare(b.LastObservationAttemptAt); c != 0 {
			return c
		}
		return strings.Compare(a.ID, b.ID)
	})
	active, deferred := make([]Job, 0), make([]Job, 0)
	for _, j := range jobs {
		if j.Status.waiting() {
			active = append(active, j)
		} else {
			deferred = append(deferred, j)
		}
	}
	activeCount := min(len(active), max(40, 50-len(deferred)))
	jobs = append(active[:activeCount], deferred[:min(len(deferred), 50-activeCount)]...)

	return jobs
}

type recoverySnapshot struct {
	commands []arr.Command
	queue    []arr.QueueSchema
	history  []arr.HistoryRecord
}

func (s *Service) recoverySnapshot(ctx context.Context, name string, since time.Time) (recoverySnapshot, error) {
	var out recoverySnapshot
	var err error
	if s.arrs == nil {
		return out, errors.New("Arr service unavailable")
	}
	out.commands, err = s.arrs.Commands(ctx, name)
	if err != nil {
		return out, err
	}
	out.queue, err = s.arrs.Queue(ctx, name)
	if err != nil {
		return out, err
	}
	out.history, err = s.arrs.GrabHistorySince(ctx, name, since.Add(-mutationClockSkew))
	return out, err
}

func (s *Service) reconcileSearchJobs(ctx context.Context) {
	if s.arrs == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, executionTimeout)
	defer cancel()
	jobs := s.observationJobs()
	since := map[string]time.Time{}
	for _, j := range jobs {
		start := attemptStart(j)
		if j.LastObservedAt.After(start) {
			start = j.LastObservedAt.Add(-2 * time.Minute)
		}
		if since[j.ArrName].IsZero() || start.Before(since[j.ArrName]) {
			since[j.ArrName] = start
		}
	}
	snapshots := map[string]recoverySnapshot{}
	failures := map[string]error{}
	for name, start := range since {
		snapshotCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		snapshots[name], failures[name] = s.recoverySnapshot(snapshotCtx, name, start)
		cancel()
	}
	for _, j := range jobs {
		if ctx.Err() != nil {
			s.recordObservationError(j, ctx.Err())
			continue
		}
		importCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		ready, err := s.jobImported(importCtx, j)
		cancel()
		if err != nil {
			s.recordObservationError(j, err)
			continue
		}
		if ready {
			if readyJob, err := s.updateObservedJob(j, StatusReady, func(current *Job) { current.LastError = ""; current.ObservationError = "" }); err == nil {
				s.verifyImported(ctx, readyJob)
			}
			continue
		}
		if err := failures[j.ArrName]; err != nil {
			s.recordObservationError(j, err)
			continue
		}
		if _, err := s.observeRecovery(j, snapshots[j.ArrName]); err != nil {
			s.recordObservationError(j, err)
		}
	}
}

func (s *Service) recordObservationError(j Job, err error) {
	status := j.Status
	// An unavailable observation is not proof of a failed search. Quarantine it
	// without holding the global queue forever; retain all mutation receipts.
	limit := waitingTimeout
	if j.Status == StatusWaitingForGrab {
		if p, e := config.Get().Repair.QueuePolicy(); e == nil {
			limit = p.SearchTimeout + p.SearchGrace
		}
	}
	if j.Cause == CauseRepair && j.Status.waiting() && s.now().Sub(phaseStart(j)) >= limit {
		status = StatusNeedsAttention
	}
	_, _ = s.updateObservedJob(j, status, func(current *Job) {
		current.ObservationError = err.Error()
		current.LastObservationAttemptAt = s.now()
		if j.Status == StatusRetryScheduled {
			current.RetryAt = s.now().Add(time.Minute)
		}
	})
}

func matchesMedia(j Job, movie, series, episode, season int) bool {
	for _, b := range j.Bindings {
		if b.ArrType == arr.Radarr && movie > 0 && movie == b.MovieID {
			return true
		}
		if b.ArrType == arr.Sonarr && series > 0 && series == b.SeriesID && ((episode > 0 && slices.Contains(b.EpisodeIDs, episode)) || (episode == 0 && season >= 0 && season == b.SeasonNumber)) {
			return true
		}
	}
	return false
}

// Returns true only when this snapshot permits a scheduled retry. Absence of
// a command receipt is never interpreted as a completed search without a grab.
func (s *Service) observeRecovery(j Job, snapshot recoverySnapshot) (bool, error) {
	if j.Cause != CauseRepair {
		return false, s.touchObservation(j)
	}
	instance, ok := s.arrs.Get(j.ArrName)
	if !ok || validateMutationInstance(instance, j.Bindings) != nil {
		return false, fmt.Errorf("Arr instance changed")
	}
	ids := slices.Clone(j.ReplacementDownloadIDs)
	status := StatusWaitingForDownload
	found := false
	message := ""
	remaining := 0.0
	queueFound := false
	for _, q := range snapshot.queue {
		if q.DownloadId != "" && strings.EqualFold(q.DownloadId, j.DownloadID) {
			continue
		}
		if !matchesMedia(j, q.MovieId, q.SeriesId, q.EpisodeId, q.SeasonNumber) && !slices.Contains(ids, q.DownloadId) {
			continue
		}
		found = true
		queueFound = true
		remaining += q.Sizeleft
		if q.DownloadId != "" && !slices.Contains(ids, q.DownloadId) {
			ids = append(ids, q.DownloadId)
		}
		state := strings.ToLower(q.TrackedDownloadState)
		if strings.Contains(state, "import") || strings.EqualFold(q.Status, "completed") {
			status = StatusWaitingForImport
		}
		for _, m := range q.StatusMessages {
			message += m.Title + ": " + strings.Join(m.Messages, "; ") + " "
		}
	}
	for _, h := range snapshot.history {
		if !strings.EqualFold(h.EventType, arr.EventGrabbed) || h.DownloadID == "" || strings.EqualFold(h.DownloadID, j.DownloadID) || h.Date.Before(attemptStart(j).Add(-mutationClockSkew)) {
			continue
		}
		if !matchesMedia(j, h.MovieID, h.SeriesID, h.EpisodeID, -1) {
			continue
		}
		found = true
		if !slices.Contains(ids, h.DownloadID) {
			ids = append(ids, h.DownloadID)
		}
	}
	if found || len(ids) > 0 {
		if j.Status == StatusWaitingForImport {
			status = j.Status
		}
		progressed := queueFound && (j.DownloadProgressAt.IsZero() || remaining < j.DownloadRemaining)
		if j.Status == StatusNeedsAttention {
			status = StatusNeedsAttention
			if message == "" {
				message = j.LastError
			}
		}
		if !progressed && j.Status == status && s.now().Sub(phaseStart(j)) >= waitingTimeout {
			status = StatusNeedsAttention
			message = "Replacement has not progressed; inspect its download/import in Arr. " + message
		}
		_, err := s.updateObservedJob(j, status, func(current *Job) {
			if progressed {
				current.DownloadProgressAt = s.now()
			}
			if queueFound {
				current.DownloadRemaining = remaining
			}
			current.ReplacementDownloadIDs = ids
			if len(ids) > 0 {
				current.ReplacementDownloadID = ids[0]
			}
			current.LastObservedAt = s.now()
			current.LastObservationAttemptAt = s.now()
			current.ObservationError = ""
			current.LastError = strings.TrimSpace(message)
			current.RetryAt = time.Time{}
		})
		return false, err
	}
	if j.Status == StatusRetryScheduled {
		// This state is only entered after a proven empty search or a safe local
		// failure with no unconfirmed remote mutation. Preflight still checks late grabs.
		_, err := s.updateObservedJob(j, j.Status, func(current *Job) {
			current.LastObservedAt = s.now()
			current.LastObservationAttemptAt = s.now()
			current.ObservationError = ""
		})
		return err == nil, err
	}
	if j.Status != StatusWaitingForGrab {
		return false, s.touchObservation(j)
	}
	policy, err := config.Get().Repair.QueuePolicy()
	if err != nil {
		return false, err
	}
	completed := j.SearchCompletedAt
	hasSearch := false
	for _, m := range j.Mutations {
		if m.Kind != MutationEpisodeSearch && m.Kind != MutationSeasonSearch && m.Kind != MutationMovieSearch {
			continue
		}
		hasSearch = true
		matched := false
		for _, c := range snapshot.commands {
			if c.ID != m.ReceiptID || m.State != MutationConfirmed || !commandScopeMatches(c.Body, m) {
				continue
			}
			matched = true
			switch strings.ToLower(c.Status) {
			case "completed":
				ended := c.Ended
				if ended.IsZero() || ended.After(s.now()) {
					ended = j.SearchCompletedAt
					if ended.IsZero() {
						ended = s.now()
					}
				}
				if completed.IsZero() || ended.After(completed) {
					completed = ended
				}
			case "failed", "aborted", "cancelled":
				return false, s.scheduleRecovery(j, "search_error", "Arr search failed or was cancelled")
			default:
				if s.now().Sub(attemptStart(j)) > policy.SearchTimeout+policy.SearchGrace {
					return false, s.attention(j, "Arr search is still running beyond its deadline; no duplicate search was sent")
				}
				return false, s.touchObservation(j)
			}
		}
		if !matched && j.SearchCompletedAt.IsZero() {
			s.recordObservationError(j, errors.New("Search command unavailable; outcome is unknown"))
			return false, nil
		}
	}
	if !hasSearch {
		s.recordObservationError(j, errors.New("No explicit search command receipt; inspect Arr history"))
		return false, nil
	}
	if !completed.IsZero() && s.now().Sub(completed) >= policy.SearchGrace {
		return false, s.scheduleRecovery(j, "no_download", "Search completed without a replacement download")
	}
	_, err = s.updateObservedJob(j, j.Status, func(current *Job) {
		current.SearchCompletedAt = completed
		current.LastObservedAt = s.now()
		current.LastObservationAttemptAt = s.now()
		current.ObservationError = ""
	})
	return false, err
}

func (s *Service) attention(j Job, reason string) error {
	_, err := s.updateObservedJob(j, StatusNeedsAttention, func(current *Job) { current.LastError = reason; current.RetryAt = time.Time{} })
	return err
}

func (s *Service) scheduleRecovery(j Job, reason, message string) error {
	for _, m := range j.Mutations {
		if m.State == MutationIntent && m.Attempts > 0 {
			return s.attention(j, "Remote action outcome unknown; inspect Arr before another search")
		}
	}
	policy, err := config.Get().Repair.QueuePolicy()
	if err != nil {
		return err
	}
	status := StatusRetryScheduled
	if j.RetryCount >= len(policy.RetryDelays) {
		status = StatusNeedsAttention
	}
	_, err = s.updateObservedJob(j, status, func(current *Job) {
		current.RetryReason = reason
		current.LastError = message
		current.LastObservedAt = s.now()
		current.LastObservationAttemptAt = s.now()
		current.ObservationError = ""
		if status == StatusRetryScheduled {
			delay := policy.RetryDelays[j.RetryCount]
			if reason == "search_error" {
				delay = []time.Duration{time.Minute, 5 * time.Minute, 30 * time.Minute}[min(j.RetryCount, 2)]
			}
			current.RetryAt = s.now().Add(delay)
		} else {
			current.RetryAt = time.Time{}
			current.LastError += "; automatic retries exhausted"
		}
	})
	return err
}

func (s *Service) prepareRecoveryRetry(ctx context.Context, j Job) bool {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	ready, err := s.jobImported(ctx, j)
	if err != nil {
		s.recordObservationError(j, err)
		return false
	}
	if ready {
		if readyJob, err := s.updateObservedJob(j, StatusReady, func(current *Job) { current.LastError = "" }); err == nil {
			s.verifyImported(ctx, readyJob)
		}
		return false
	}
	snapshot, err := s.recoverySnapshot(ctx, j.ArrName, attemptStart(j))
	if err != nil {
		s.recordObservationError(j, err)
		return false
	}
	safe, err := s.observeRecovery(j, snapshot)
	if err != nil {
		s.recordObservationError(j, err)
	}
	return safe && err == nil
}

// RetryJob changes eligibility, not dispatch. The normal rate/batch/season
// checks still apply, including a fresh remote-state check before execution.
func (s *Service) RetryJob(id string) (Job, error) {
	release, err := s.beginOperation()
	if err != nil {
		return Job{}, err
	}
	defer release()
	j, ok := s.Job(id)
	if !ok {
		return Job{}, ErrBindingNotFound
	}
	if j.Status != StatusRetryScheduled && !(j.Status == StatusNeedsAttention && (j.RetryReason == "no_download" || j.RetryReason == "search_error")) {
		return Job{}, fmt.Errorf("job cannot be retried safely in its current state")
	}
	for _, m := range j.Mutations {
		if m.State == MutationIntent && m.Attempts > 0 {
			return Job{}, fmt.Errorf("reconcile the uncertain Arr action before retrying")
		}
	}
	job, err := s.updateObservedJob(j, StatusRetryScheduled, func(current *Job) { current.RetryAt = s.now(); current.Paused = false })
	if err == nil {
		s.signal()
	}
	return job, err
}

func (s *Service) PauseJob(id string, paused bool) (Job, error) {
	release, err := s.beginOperation()
	if err != nil {
		return Job{}, err
	}
	defer release()
	j, ok := s.Job(id)
	if !ok {
		return Job{}, ErrBindingNotFound
	}
	if j.Status.Terminal() {
		return Job{}, fmt.Errorf("job is already complete")
	}
	job, err := s.updateObservedJob(j, j.Status, func(current *Job) { current.Paused = paused })
	if err == nil {
		s.signal()
	}
	return job, err
}

func (s *Service) touchObservation(j Job) error {
	_, err := s.updateObservedJob(j, j.Status, func(current *Job) {
		current.LastObservedAt = s.now()
		current.LastObservationAttemptAt = s.now()
		current.ObservationError = ""
	})
	return err
}
func sameRecoveryMedia(a, b Binding) bool {
	if a.ArrName != b.ArrName || a.ArrInstanceFingerprint != b.ArrInstanceFingerprint {
		return false
	}
	if a.MovieID > 0 && a.MovieID == b.MovieID {
		return true
	}
	if a.SeriesID > 0 && a.SeriesID == b.SeriesID {
		for _, id := range a.EpisodeIDs {
			if slices.Contains(b.EpisodeIDs, id) {
				return true
			}
		}
	}
	return false
}

// Build once per dispatch selection; checking every queued job against the
// entire backlog would make a large library's queue quadratic.
func recoveryScopes(job Job) []string {
	var keys []string
	for _, b := range job.Bindings {
		base := b.ArrName + "\x00" + b.ArrInstanceFingerprint + "\x00"
		if b.MovieID > 0 {
			keys = append(keys, base+"movie:"+strconv.Itoa(b.MovieID))
		}
		if season := repairSeasonKey(b); season != "" {
			keys = append(keys, "season:"+season)
		}
		for _, id := range b.EpisodeIDs {
			keys = append(keys, base+"episode:"+strconv.Itoa(id))
		}
	}
	return keys
}
func (s *Service) scopeGuardsLocked() func(Job) bool {
	occupied := make(map[string]bool)
	deferred := make(map[string]Job)
	for _, other := range s.jobs {
		if other.Cause != CauseRepair || other.Status.Terminal() {
			continue
		}
		if other.occupiesSlot() || other.Status == StatusNeedsAttention {
			for _, key := range recoveryScopes(other) {
				occupied[key] = true
			}
		} else if other.Status == StatusRetryScheduled {
			for _, key := range recoveryScopes(other) {
				current, exists := deferred[key]
				if !exists || other.CreatedAt.Before(current.CreatedAt) || (other.CreatedAt.Equal(current.CreatedAt) && other.ID < current.ID) {
					deferred[key] = other
				}
			}
		}
	}
	return func(job Job) bool {
		for _, key := range recoveryScopes(job) {
			if occupied[key] {
				return true
			}
			if owner, exists := deferred[key]; exists && (job.Status != StatusRetryScheduled || owner.ID != job.ID) {
				return true
			}
		}
		return false
	}
}
