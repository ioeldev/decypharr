package repair

import (
	"context"
	"fmt"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"github.com/sirrobot01/decypharr/pkg/arr"
	"github.com/sirrobot01/decypharr/pkg/arr/reacquire"
	"github.com/sirrobot01/decypharr/pkg/storage"
)

func libraryMediaKey(f storage.BrokenFile) string {
	ids := slices.Clone(f.EpisodeIDs)
	if len(ids) == 0 && f.EpisodeID > 0 {
		ids = []int{f.EpisodeID}
	}
	slices.Sort(ids)
	return fmt.Sprintf("%s/%s/%s/%d/%v", f.ArrName, f.ArrFingerprint, f.ArrKind, f.MediaID, ids)
}

func (r *Service) PauseLibraryIncident(name string, paused bool) error {
	r.auditControlMu.Lock()
	defer r.auditControlMu.Unlock()
	h, err := r.storage.GetEntryHealth(name)
	if err != nil || h.LibraryFile == nil {
		return fmt.Errorf("library incident not found")
	}
	h.LibraryPaused = paused
	return r.storage.SaveEntryHealth(h)
}

func (r *Service) refreshLibraryIncident(ctx context.Context, h *storage.EntryHealth) error {
	b := h.LibraryFile
	instance, ok := r.arrInstance(b.ArrName)
	if !ok || instance.Fingerprint() != b.ArrFingerprint {
		return fmt.Errorf("Arr instance changed; run a new audit")
	}
	files, err := r.arrs.LibraryFilesForMedia(ctx, b.ArrName, []int{b.MediaID})
	if err != nil {
		return err
	}
	for _, f := range files {
		if f.ArrFileID <= 0 || f.Path == "" {
			continue
		}
		match := instance.Type == arr.Radarr && f.MovieID == b.MediaID
		if instance.Type == arr.Sonarr && f.SeriesID == b.MediaID {
			ids := b.EpisodeIDs
			if len(ids) == 0 && b.EpisodeID > 0 {
				ids = []int{b.EpisodeID}
			}
			match = len(ids) > 0
			for _, id := range ids {
				if !slices.Contains(f.EpisodeIDs, id) {
					match = false
				}
			}
		}
		if !match {
			continue
		}
		// Copy identity so a blocked filesystem worker cannot observe concurrent edits.
		next := *b
		next.SourcePath = f.Path
		next.ArrFileID = f.ArrFileID
		next.FileName = filepath.Base(f.Path)
		next.Size = f.Size
		next.EpisodeIDs = slices.Clone(f.EpisodeIDs)
		next.SeasonNumber = f.SeasonNumber
		next.InfoHash = ""
		next.EntryName = ""
		next.TargetPath = ""
		h.LibraryFile = &next
		h.LibraryRemoved = false
		return nil
	}
	return fmt.Errorf("no imported replacement is currently available in Arr")
}

// Called after a confirmed import. This validates bytes through the library
// mount; a successful Arr import alone is never displayed as a healthy read.
func (r *Service) VerifyLibraryRecovery(ctx context.Context, job reacquire.Job) {
	ctx, cancel := context.WithTimeout(ctx, libraryProbeTimeout)
	defer cancel()
	r.mu.Lock()
	if r.activeRunID != "" {
		r.mu.Unlock()
		return
	} // next audit/recheck performs validation
	r.activeRunID = "import-validation:" + job.ID
	r.cancelRun = cancel
	r.runWG.Add(1)
	defer r.runWG.Done()
	r.mu.Unlock()
	defer func() {
		r.mu.Lock()
		if r.activeRunID == "import-validation:"+job.ID {
			r.activeRunID = ""
			r.cancelRun = nil
		}
		r.mu.Unlock()
	}()
	if ready := r.libraryMountReady(ctx); ready.status != storage.HealthHealthy {
		return
	}
	var incidents []*storage.EntryHealth
	_ = r.storage.ForEachEntryHealth(func(h *storage.EntryHealth) error {
		if h.LibraryFile == nil || h.LastFailedAt.IsZero() {
			return nil
		}
		f := h.LibraryFile
		for _, b := range job.Bindings {
			if f.ArrName != b.ArrName || f.ArrFingerprint != b.ArrInstanceFingerprint {
				continue
			}
			match := b.MovieID > 0 && f.ArrKind == storage.ArrKindRadarr && b.MovieID == f.MediaID
			if b.SeriesID > 0 && f.ArrKind == storage.ArrKindSonarr && b.SeriesID == f.MediaID && slices.Contains(b.EpisodeIDs, f.EpisodeID) {
				match = true
			}
			if match {
				incidents = append(incidents, h)
				break
			}
		}
		return nil
	})
	for _, h := range incidents {
		if ctx.Err() != nil {
			return
		}
		if err := r.refreshLibraryIncident(ctx, h); err != nil {
			continue
		}
		r.auditOneLibraryFile(ctx, h)
	}
}

// LibraryIncidents retains unresolved and resolved findings, including old Arr
// file IDs which vanished during a replacement. Never probes from a GET handler.
func (r *Service) LibraryIncidents() ([]*storage.EntryHealth, error) {
	out := make([]*storage.EntryHealth, 0)
	err := r.storage.ForEachEntryHealth(func(h *storage.EntryHealth) error {
		if h.LibraryFile != nil && (!h.LastFailedAt.IsZero() || h.Status == storage.HealthBroken || h.Status == storage.HealthUnknown) {
			out = append(out, h)
		}
		return nil
	})
	slices.SortFunc(out, func(a, b *storage.EntryHealth) int {
		return strings.Compare(a.DisplayName+strconv.Itoa(a.LibraryFile.MediaID), b.DisplayName+strconv.Itoa(b.LibraryFile.MediaID))
	})
	return out, err
}
