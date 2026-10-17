package reacquire

import (
	"context"
	"fmt"
	"slices"
	"strconv"

	"github.com/sirrobot01/decypharr/pkg/arr"
)

type LibraryRequest struct {
	ArrName     string
	ArrFileID   int
	LibraryPath string
	Cause       Cause
}

// ReacquireLibraryFile verifies an unindexed file before it queues replacement.
func (s *Service) ReacquireLibraryFile(ctx context.Context, request LibraryRequest) (*Job, error) {
	release, err := s.beginOperation()
	if err != nil {
		return nil, err
	}
	defer release()
	if s.arrs == nil {
		return nil, fmt.Errorf("Arr registry is unavailable")
	}
	if request.ArrFileID <= 0 || request.LibraryPath == "" || !request.Cause.valid() {
		return nil, fmt.Errorf("Arr file ID, library path, and cause are required")
	}
	instance, ok := s.arrs.Get(request.ArrName)
	if !ok {
		return nil, fmt.Errorf("Arr %q is unavailable", request.ArrName)
	}
	if binding, ok := s.index.ByArrFile(instance.Name, request.ArrFileID); ok {
		if !binding.AuthorizesMutation() || !sameLibraryPath(binding.LibraryPath, request.LibraryPath) {
			return nil, ErrBindingUnsafe
		}
		return s.enqueueLibrary(Request{EntryID: binding.EntryID, FileID: binding.EntryFileID,
			Cause: request.Cause, Strategy: StrategyHistoryFailed}, binding)
	}
	fileID := strconv.Itoa(request.ArrFileID)
	entryID := "arr-library:" + instance.Fingerprint() + ":" + fileID
	// Return an existing job before the remote file is read. The job may have deleted it.
	s.jobsMu.RLock()
	id, exists := s.activeReacquisitions[jobKey{arrName: instance.Name, entryID: entryID, fileID: fileID}]
	job := cloneJob(s.jobs[id])
	s.jobsMu.RUnlock()
	if exists {
		return &job, nil
	}
	current, found, err := s.arrs.LibraryFile(ctx, instance.Name, request.ArrFileID)
	if err != nil {
		return nil, err
	}
	if !found || current.ArrFileID != request.ArrFileID || !sameLibraryPath(request.LibraryPath, current.Path) {
		return nil, fmt.Errorf("%w: Arr file no longer matches the broken path", ErrBindingUnsafe)
	}
	binding := Binding{
		ArrName: instance.Name, ArrType: instance.Type, ArrInstanceFingerprint: instance.Fingerprint(),
		EntryID: entryID, EntryFileID: fileID, ArrFileID: current.ArrFileID, LibraryPath: current.Path,
		SeriesID: current.SeriesID, SeasonNumber: current.SeasonNumber, EpisodeIDs: current.EpisodeIDs,
		MovieID: current.MovieID, Confidence: ConfidenceLibraryFile,
	}
	if !binding.AuthorizesMutation() {
		return nil, ErrBindingUnsafe
	}
	if err := validateSearchBindings(instance, []Binding{binding}); err != nil {
		return nil, err
	}
	return s.enqueueLibrary(Request{EntryID: entryID, FileID: fileID, Cause: request.Cause, Strategy: StrategyCommandSearch}, binding)
}

// reconcileImportedJobs uses Arr file IDs to confirm every replacement.
// A replacement can be imported before the managed index observes it.
func (s *Service) reconcileImportedJobs(ctx context.Context) {
	if s.arrs == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, executionTimeout)
	defer cancel()
	for _, job := range s.observationJobs() {
		if ctx.Err() != nil {
			return
		}
		ready, err := s.jobImported(ctx, job)
		if err != nil {
			s.recordObservationError(job, err)
			continue
		}
		if ready {
			_, _ = s.updateObservedJob(job, StatusReady, func(current *Job) { current.LastError = ""; current.ObservationError = "" })
		}
	}
}

func (s *Service) jobImported(ctx context.Context, job Job) (bool, error) {
	if s.arrs == nil {
		return false, fmt.Errorf("Arr service unavailable")
	}
	instance, ok := s.arrs.Get(job.ArrName)
	if !ok || len(job.Bindings) == 0 {
		return false, ErrBindingUnsafe
	}
	if err := validateMutationInstance(instance, job.Bindings); err != nil {
		return false, err
	}
	oldFiles := map[int]bool{}
	for _, b := range job.Bindings {
		oldFiles[b.ArrFileID] = true
	}
	cache := map[int][]arr.LibraryFile{}
	for _, b := range job.Bindings {
		if !b.AuthorizesMutation() {
			return false, ErrBindingUnsafe
		}
		mediaID := b.MovieID
		if instance.Type == arr.Sonarr {
			mediaID = b.SeriesID
		}
		if mediaID <= 0 {
			return false, ErrBindingUnsafe
		}
		files, exists := cache[mediaID]
		if !exists {
			var err error
			files, err = s.arrs.LibraryFilesForMedia(ctx, instance.Name, []int{mediaID})
			if err != nil {
				return false, err
			}
			cache[mediaID] = files
		}
		remaining := slices.Clone(b.EpisodeIDs)
		replaced := false
		for _, file := range files {
			if oldFiles[file.ArrFileID] || file.ArrFileID <= 0 || file.Path == "" {
				continue
			}
			if instance.Type == arr.Radarr && file.MovieID == b.MovieID {
				replaced = true
				break
			}
			if instance.Type == arr.Sonarr && file.SeriesID == b.SeriesID {
				remaining = slices.DeleteFunc(remaining, func(id int) bool { return slices.Contains(file.EpisodeIDs, id) })
				replaced = len(b.EpisodeIDs) > 0 && len(remaining) == 0
			}
		}
		if !replaced {
			return false, nil
		}
	}
	return true, nil
}

func (s *Service) enqueueLibrary(request Request, binding Binding) (*Job, error) {
	request.LibraryAudit = true
	return s.enqueue(request, binding)
}
