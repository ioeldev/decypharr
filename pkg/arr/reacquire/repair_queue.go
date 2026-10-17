package reacquire

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
)

// Stored separately from job history: clearing terminal jobs must not reset the
// rate limit, and a restart must retain a batch cooldown already reserved.
type repairQueueState struct {
	NextAllowedAt time.Time `json:"next_allowed_at"`
	InBatch       int       `json:"in_batch"`
}

type RepairQueueStatus struct {
	Queued        int            `json:"queued"`
	Total         int            `json:"total"`
	StatusCounts  map[Status]int `json:"status_counts"`
	InFlight      int            `json:"in_flight"`
	InBatch       int            `json:"in_batch"`
	NextAllowedAt time.Time      `json:"next_allowed_at,omitzero"`
	Interval      string         `json:"interval"`
	BatchSize     int            `json:"batch_size"`
	BatchPause    string         `json:"batch_pause"`
	MaxActive     int            `json:"max_active"`
	Paused        bool           `json:"paused"`
	Error         string         `json:"error,omitempty"`
}

func (s *Service) loadRepairQueue() error {
	data, err := os.ReadFile(s.repairQueuePath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var state repairQueueState
	if err := json.Unmarshal(data, &state); err != nil {
		return fmt.Errorf("decode repair queue state: %w", err)
	}
	if state.InBatch < 0 {
		return errors.New("invalid repair queue batch counter")
	}
	s.repairQueueMu.Lock()
	s.repairQueueState = state
	s.repairQueueMu.Unlock()
	return nil
}

func saveRepairQueue(path string, state repairQueueState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".repair-queue-*")
	if err != nil {
		return err
	}
	temp := f.Name()
	defer os.Remove(temp)
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := os.Rename(temp, path); err != nil {
		return err
	}
	dir, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func (s *Service) RepairQueueStatus() RepairQueueStatus {
	policy, err := config.Get().Repair.QueuePolicy()
	s.repairQueueMu.Lock()
	state := s.repairQueueState
	lastError := s.repairQueueError
	s.repairQueueMu.Unlock()
	out := RepairQueueStatus{InBatch: state.InBatch, NextAllowedAt: state.NextAllowedAt, Interval: policy.Interval.String(), BatchSize: policy.BatchSize, BatchPause: policy.BatchPause.String(), MaxActive: policy.MaxActive, Paused: policy.Paused, Error: lastError}
	if err != nil {
		out.Error = err.Error()
		out.Paused = true
	}
	out.StatusCounts = make(map[Status]int)
	s.jobsMu.RLock()
	defer s.jobsMu.RUnlock()
	for _, job := range s.jobs {
		if job.Cause != CauseRepair {
			continue
		}
		out.Total++
		out.StatusCounts[job.Status]++
		if job.Status.Terminal() {
			continue
		}
		if !job.occupiesSlot() {
			if job.Status == StatusQueued {
				out.Queued++
			}
			continue
		}
		out.InFlight++
	}
	return out
}

// Called by the single worker immediately before starting a new repair. Write
// and sync the reservation before any Arr mutation. A failed save blocks dispatch.
func (s *Service) reserveRepairDispatch(job Job) error {
	if job.Cause != CauseRepair || !job.newDispatch() {
		return nil
	}
	policy, err := config.Get().Repair.QueuePolicy()
	if err != nil {
		return err
	}
	if policy.Paused {
		return errors.New("repair queue is paused")
	}
	s.repairQueueMu.Lock()
	defer s.repairQueueMu.Unlock()
	state := s.repairQueueState
	if s.now().Before(state.NextAllowedAt) {
		return errors.New("repair queue is waiting for its next dispatch slot")
	}
	state.InBatch++
	state.NextAllowedAt = s.now().Add(policy.Interval)
	if state.InBatch >= policy.BatchSize {
		state.InBatch = 0
		state.NextAllowedAt = s.now().Add(max(policy.Interval, policy.BatchPause))
	}
	if err := saveRepairQueue(s.repairQueuePath, state); err != nil {
		s.repairQueueError = err.Error()
		return err
	}
	s.repairQueueState = state
	s.repairQueueError = ""
	return nil
}

func repairSeasonKey(b Binding) string {
	if b.ArrType != arr.Sonarr || b.SeriesID <= 0 {
		return ""
	}
	return b.ArrName + "\x00" + b.ArrInstanceFingerprint + "\x00" + strconv.Itoa(b.SeriesID) + "\x00" + strconv.Itoa(b.SeasonNumber)
}

// A previous pack recovery may already have replaced another queued orphan.
// Verify that case by Arr identity before allowing another delete/search.
func (s *Service) completeQueuedLibraryJob(ctx context.Context, job Job) (bool, error) {
	if job.Cause != CauseRepair || !job.newDispatch() || len(job.Bindings) != 1 || job.Bindings[0].Confidence != ConfidenceLibraryFile || s.arrs == nil {
		return false, nil
	}
	b := job.Bindings[0]
	instance, ok := s.arrs.Get(b.ArrName)
	if !ok || instance.Fingerprint() != b.ArrInstanceFingerprint {
		return false, ErrBindingUnsafe
	}
	_, found, err := s.arrs.LibraryFile(ctx, b.ArrName, b.ArrFileID)
	if err != nil || found {
		return false, err
	}
	mediaID := b.MovieID
	if b.ArrType == arr.Sonarr {
		mediaID = b.SeriesID
	}
	files, err := s.arrs.LibraryFilesForMedia(ctx, b.ArrName, []int{mediaID})
	if err != nil {
		return false, err
	}
	remaining := slices.Clone(b.EpisodeIDs)
	covered := false
	for _, file := range files {
		if file.ArrFileID <= 0 || file.ArrFileID == b.ArrFileID || file.Path == "" {
			continue
		}
		if b.ArrType == arr.Radarr && file.MovieID == b.MovieID {
			covered = true
			break
		}
		if b.ArrType == arr.Sonarr && file.SeriesID == b.SeriesID {
			remaining = slices.DeleteFunc(remaining, func(id int) bool { return slices.Contains(file.EpisodeIDs, id) })
			covered = len(b.EpisodeIDs) > 0 && len(remaining) == 0
		}
	}
	if !covered {
		return false, nil
	}
	_, err = s.updateJobDurable(job.ID, StatusReady, func(job *Job) { job.LastError = "" })
	return err == nil, err
}
