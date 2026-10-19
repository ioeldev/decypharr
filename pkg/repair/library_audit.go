package repair

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
	"github.com/sirrobot01/decypharr/pkg/storage"
	"golang.org/x/sync/errgroup"
)

const librarySampleBytes = 64 * 1024
const libraryProbeTimeout = 30 * time.Second

type libraryProbeResult struct {
	status storage.HealthStatus
	reason string
}

func libraryKey(instance arr.Arr, id int) string {
	sum := sha256.Sum256([]byte(instance.Name + "\x00" + instance.Fingerprint() + "\x00" + strconv.Itoa(id)))
	return fmt.Sprintf("library:%x", sum[:])
}

// acquireLibraryProbe shares the worker budget across audits and rechecks.
// Cancellation never releases a slot still occupied by a blocked syscall.
// Read the configured limit on each acquisition, without replacing the gate
// when settings change (which would lose track of older blocked reads).
func (r *Service) acquireLibraryProbe(ctx context.Context) bool {
	for {
		r.libraryProbeMu.Lock()
		if ctx.Err() != nil {
			r.libraryProbeMu.Unlock()
			return false
		}
		if r.libraryProbeActive < r.workers() {
			r.libraryProbeActive++
			r.libraryProbeMu.Unlock()
			return true
		}
		changed := r.libraryProbeChanged
		r.libraryProbeMu.Unlock()
		select {
		case <-ctx.Done():
			return false
		case <-changed:
		}
	}
}

func (r *Service) releaseLibraryProbe() {
	r.libraryProbeMu.Lock()
	defer r.libraryProbeMu.Unlock()
	r.libraryProbeActive--
	close(r.libraryProbeChanged)
	r.libraryProbeChanged = make(chan struct{})
}

func (r *Service) boundedLibraryIO(ctx context.Context, timeout time.Duration, probe func() libraryProbeResult) libraryProbeResult {
	if ctx.Err() != nil {
		return libraryProbeResult{storage.HealthUnknown, "library_read_timeout"}
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	if !r.acquireLibraryProbe(ctx) {
		return libraryProbeResult{storage.HealthUnknown, "library_io_busy"}
	}
	result := make(chan libraryProbeResult, 1)
	go func() {
		defer r.releaseLibraryProbe()
		result <- probe()
	}()
	select {
	case value := <-result:
		return value
	case <-ctx.Done():
		return libraryProbeResult{storage.HealthUnknown, "library_read_timeout"}
	}
}

func libraryRead(path string) libraryProbeResult {
	// Missing library mounts or parent directories must not trigger mass repairs.
	if !filepath.IsAbs(path) {
		return libraryProbeResult{storage.HealthUnknown, "library_path_not_absolute"}
	}
	parent, err := os.Stat(filepath.Dir(path))
	if err != nil || !parent.IsDir() {
		return libraryProbeResult{storage.HealthUnknown, "library_directory_unavailable"}
	}
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return libraryProbeResult{storage.HealthBroken, "library_target_missing"}
		}
		return libraryProbeResult{storage.HealthUnknown, "library_stat_error"}
	}
	if !info.Mode().IsRegular() {
		return libraryProbeResult{storage.HealthUnknown, "library_not_regular"}
	}
	if info.Size() < librarySampleBytes {
		return libraryProbeResult{storage.HealthBroken, "library_file_too_small"}
	}
	file, err := os.Open(path)
	if err != nil {
		return libraryProbeResult{storage.HealthUnknown, "library_open_error"}
	}
	defer file.Close()
	data := make([]byte, librarySampleBytes)
	_, err = io.ReadFull(file, data)
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return libraryProbeResult{storage.HealthBroken, "library_short_read"}
	}
	if err != nil {
		return libraryProbeResult{storage.HealthUnknown, "library_read_error"}
	}
	head := bytes.ToLower(bytes.TrimSpace(data))
	if bytes.HasPrefix(head, []byte("<!doctype html")) || bytes.HasPrefix(head, []byte("<html")) || bytes.HasPrefix(head, []byte("<?xml")) {
		return libraryProbeResult{storage.HealthBroken, "library_error_document"}
	}
	return libraryProbeResult{status: storage.HealthHealthy}
}

func (r *Service) probeLibraryPath(ctx context.Context, path string) libraryProbeResult {
	return r.boundedLibraryIO(ctx, libraryProbeTimeout, func() libraryProbeResult {
		result := libraryRead(path)
		// Confirm a definite failure before making it eligible for repair.
		if result.status == storage.HealthBroken {
			second := libraryRead(path)
			if second != result {
				return libraryProbeResult{storage.HealthUnknown, "library_inconsistent_read"}
			}
		}
		return result
	})
}

func (r *Service) libraryMountReady(ctx context.Context) libraryProbeResult {
	mount := config.Get().Mount
	if mount.MountPath == "" {
		return libraryProbeResult{storage.HealthUnknown, "library_mount_not_configured"}
	}
	return r.boundedLibraryIO(ctx, libraryProbeTimeout, func() libraryProbeResult {
		path := mount.MountPath
		// The built-in mount exposes version.txt only while it is actually mounted.
		if string(mount.Type) == "dfs" {
			path = filepath.Join(path, "version.txt")
		}
		if _, err := os.Stat(path); err != nil {
			return libraryProbeResult{storage.HealthUnknown, "library_mount_unavailable"}
		}
		return libraryProbeResult{status: storage.HealthHealthy}
	})
}

func (r *Service) collectLibraryAuditFiles(ctx context.Context, opts RunOptions) ([]*storage.EntryHealth, error) {
	var out []*storage.EntryHealth
	if len(opts.LibraryEntries) > 0 {
		seen := make(map[string]bool)
		for _, key := range opts.LibraryEntries {
			if seen[key] {
				continue
			}
			seen[key] = true
			health, err := r.storage.GetEntryHealth(key)
			if err != nil || health == nil || health.LibraryFile == nil {
				return nil, fmt.Errorf("library audit entry not found")
			}
			if r.arrs != nil && health.LibraryFile.MediaID > 0 {
				if err := r.refreshLibraryIncident(ctx, health); err != nil {
					return nil, err
				}
			}
			out = append(out, health)
		}
		return out, nil
	}
	for _, instance := range r.eligibleArrs(r.cfg().Arrs) {
		if instance.Type != arr.Sonarr && instance.Type != arr.Radarr {
			continue
		}
		prior := map[string]*storage.EntryHealth{}
		_ = r.storage.ForEachEntryHealth(func(h *storage.EntryHealth) error {
			if h.LibraryFile != nil && h.LibraryFile.ArrName == instance.Name && h.LibraryFile.ArrFingerprint == instance.Fingerprint() {
				key := libraryMediaKey(*h.LibraryFile)
				if old := prior[key]; old == nil || (!h.LastFailedAt.IsZero() && old.LastFailedAt.IsZero()) {
					prior[key] = h
				}
			}
			return nil
		})
		files, err := r.arrs.LibraryFiles(ctx, instance.Name)
		if err != nil {
			return nil, fmt.Errorf("enumerate library for Arr %s: %w", instance.Name, err)
		}
		seen := make(map[string]bool)
		for _, file := range files {
			if file.ArrFileID <= 0 || file.Path == "" {
				continue
			}
			key := libraryKey(instance, file.ArrFileID)
			if seen[key] {
				continue
			}
			seen[key] = true
			h, _ := r.storage.GetEntryHealth(key)
			if h == nil {
				h = &storage.EntryHealth{EntryName: key}
			}
			broken := storage.BrokenFile{
				LibraryAudit: true, ArrName: instance.Name, ArrKind: arrKindFromType(instance.Type), ArrFingerprint: instance.Fingerprint(),
				ArrFileID: file.ArrFileID, SourcePath: file.Path, FileName: filepath.Base(file.Path), Size: file.Size,
				MediaID: file.MovieID, EpisodeIDs: slices.Clone(file.EpisodeIDs), SeasonNumber: file.SeasonNumber,
			}
			if instance.Type == arr.Sonarr {
				broken.MediaID = file.SeriesID
			}
			if len(file.EpisodeIDs) > 0 {
				broken.EpisodeID = file.EpisodeIDs[0]
			}
			if old := prior[libraryMediaKey(broken)]; old != nil {
				h = old
				key = h.EntryName
				seen[key] = true
			}
			unchanged := h.LibraryFile != nil && h.LibraryFile.ArrFileID == file.ArrFileID && h.LibraryFile.SourcePath == file.Path
			if unchanged && !opts.IgnoreLastChecked && !h.IsDue(time.Now(), r.recheckInterval()) {
				continue
			}
			h.LibraryRemoved = false
			// Readlink does not dereference a missing target. Do not guess by size/title.
			// Do this in the bounded worker during probing, never on the API goroutine.
			h.LibraryFile = &broken
			h.DisplayName = filepath.Base(filepath.Dir(file.Path)) + " / " + filepath.Base(file.Path)
			out = append(out, h)
		}
		// Remove results for files the Arr no longer owns after a completed
		// enumeration (for example the old ID after a successful replacement).
		var stale []string
		var removed []*storage.EntryHealth
		_ = r.storage.ForEachEntryHealth(func(h *storage.EntryHealth) error {
			if f := h.LibraryFile; f != nil && f.ArrName == instance.Name && f.ArrFingerprint == instance.Fingerprint() && !seen[h.EntryName] {
				if !h.LastFailedAt.IsZero() {
					if !h.LibraryRemoved {
						h.LibraryRemoved = true
						h.Status = storage.HealthUnknown
						h.FailureReason = "library_file_removed_from_arr"
						h.BrokenFiles = nil
						removed = append(removed, h)
					}
				} else {
					stale = append(stale, h.EntryName)
				}
			}
			return nil
		})
		for _, h := range removed {
			r.saveHealth(h)
		}
		for _, key := range stale {
			if err := r.storage.DeleteEntryHealth(key); err != nil {
				return nil, err
			}
		}
	}
	slices.SortFunc(out, func(a, b *storage.EntryHealth) int { return strings.Compare(a.EntryName, b.EntryName) })
	return out, nil
}

func (r *Service) auditOneLibraryFile(ctx context.Context, h *storage.EntryHealth) libraryProbeResult {
	broken := *h.LibraryFile
	result := r.boundedLibraryIO(ctx, libraryProbeTimeout, func() libraryProbeResult {
		// Keep filesystem access in this worker; bind storage after it exits.
		target := readSymlinkTarget(broken.SourcePath)
		broken.TargetPath = target
		value := libraryRead(broken.SourcePath)
		if value.status == storage.HealthBroken {
			if second := libraryRead(broken.SourcePath); second != value {
				return libraryProbeResult{storage.HealthUnknown, "library_inconsistent_read"}
			}
		}
		return value
	})
	// Never access the worker's local data after a timeout: it may still be writing.
	if result.reason != "library_read_timeout" && result.reason != "library_io_busy" {
		if broken.TargetPath != "" {
			name := filepath.Base(filepath.Dir(broken.TargetPath))
			if item, err := r.storage.GetEntryItem(name); err == nil && item != nil {
				if file := item.Files[filepath.Base(broken.TargetPath)]; file != nil && !file.Deleted {
					broken.EntryName = name
					broken.InfoHash = file.InfoHash
					broken.FileName = filepath.Base(broken.TargetPath)
					if entry, err := r.storage.Get(file.InfoHash); err == nil && entry != nil {
						broken.Protocol = entry.Protocol
					}
				}
			}
		}
		h.LibraryFile = &broken
		h.Protocol = broken.Protocol
	}
	h.Status = result.status
	h.FailureReason = result.reason
	h.FileCount = 1
	h.BrokenCount = 0
	h.BrokenFiles = nil
	h.LastCheckedAt = time.Now()
	h.ActiveRunID = ""
	h.Dirty = false
	h.DirtyReason = ""
	h.NextCheckDueAt = h.LastCheckedAt.Add(r.recheckInterval())
	if result.status == storage.HealthHealthy {
		h.LastOKAt = h.LastCheckedAt
	}
	if result.status == storage.HealthBroken {
		broken.Reason = result.reason
		h.LastFailedAt = h.LastCheckedAt
		h.BrokenCount = 1
		h.BrokenFiles = []storage.BrokenFile{broken}
	}
	r.saveHealth(h)
	return result
}

func (r *Service) executeLibraryAudit(ctx context.Context, run *storage.RepairRun, opts RunOptions, stop *repairStopState) {
	autoRepair := r.cfg().AutoRepair
	if opts.AutoRepair != nil {
		autoRepair = *opts.AutoRepair
	}
	files, err := r.collectLibraryAuditFiles(ctx, opts)
	if ctx.Err() != nil {
		r.finishCancelledRepairSweep(ctx, run, stop, autoRepair, "library audit cancelled during selection", nil)
		return
	}
	if err != nil {
		r.finalizeRun(run, storage.RepairRunFailed, err.Error(), "")
		return
	}
	if len(files) == 0 {
		r.finalizeRun(run, storage.RepairRunCompleted, "", "")
		return
	}
	if ready := r.libraryMountReady(ctx); ready.status != storage.HealthHealthy {
		if ctx.Err() != nil {
			r.finishCancelledRepairSweep(ctx, run, stop, autoRepair, "library audit cancelled during mount check", nil)
			return
		}
		r.finalizeRun(run, storage.RepairRunFailed, ready.reason, "")
		return
	}
	run.Stats.Candidates = len(files)
	run.Stage = storage.RepairStageProbing
	r.saveRun(run)
	var mu sync.Mutex
	var names []string
	var repairMu sync.Mutex
	g, probeCtx := errgroup.WithContext(ctx)
	g.SetLimit(r.workers())
	for _, group := range groupLibraryAuditFiles(files, r.cfg().ReplaceWholeSeason) {
		if probeCtx.Err() != nil {
			break
		}
		g.Go(func() error {
			for index, health := range group {
				if probeCtx.Err() != nil {
					return probeCtx.Err()
				}
				result := r.auditOneLibraryFile(probeCtx, health)
				mu.Lock()
				names = append(names, health.EntryName)
				run.Stats.Probed++
				switch result.status {
				case storage.HealthHealthy:
					run.Stats.Healthy++
				case storage.HealthBroken:
					run.Stats.Broken++
				default:
					run.Stats.Unknown++
				}
				r.saveRun(run)
				mu.Unlock()
				if result.reason == "library_read_timeout" || result.reason == "library_io_busy" {
					return fmt.Errorf("%s: audit stopped to avoid accumulating blocked filesystem reads", result.reason)
				}
				if autoRepair && health.Status == storage.HealthBroken {
					// Several files may belong to the same torrent. Preserve serial
					// restoration/submission while allowing unrelated probes to run.
					repairMu.Lock()
					if probeCtx.Err() == nil {
						r.healBrokenEntry(probeCtx, run, &mu, health)
					}
					repairMu.Unlock()
				}
				if health.Status == storage.HealthBroken && index+1 < len(group) && probeCtx.Err() == nil {
					// One confirmed incident is enough to replace this season. Leave
					// unprobed files' health and check timestamps untouched.
					mu.Lock()
					run.Stats.SkippedSeason += len(group) - index - 1
					r.saveRun(run)
					mu.Unlock()
					break
				}
			}
			return nil
		})
	}
	err = g.Wait()
	if ctx.Err() != nil {
		r.finishCancelledRepairSweep(ctx, run, stop, autoRepair, "library audit cancelled", names)
		return
	}
	if err != nil {
		r.finalizeRun(run, storage.RepairRunFailed, err.Error(), "")
		return
	}
	r.finalizeRun(run, storage.RepairRunCompleted, "", "")
}

// Only confirmed defects can reach Arr deletion/search. This also prevents an
// old View broken record from replacing a file that has since become readable.
func (r *Service) restoreLibraryFile(ctx context.Context, broken storage.BrokenFile) (bool, error) {
	if broken.ArrFingerprint != "" {
		instance, ok := r.arrInstance(broken.ArrName)
		if !ok || instance.Fingerprint() != broken.ArrFingerprint {
			return false, fmt.Errorf("library Arr instance changed; run a new audit")
		}
	}
	if ready := r.libraryMountReady(ctx); ready.status != storage.HealthHealthy {
		return false, fmt.Errorf("%s", ready.reason)
	}
	result := r.probeLibraryPath(ctx, broken.SourcePath)
	if result.status == storage.HealthHealthy {
		return true, nil
	}
	if result.status != storage.HealthBroken {
		return false, fmt.Errorf("%s", result.reason)
	}
	if broken.InfoHash != "" && r.backend != nil {
		entry, err := r.storage.Get(broken.InfoHash)
		if err == nil && entry != nil && entry.Protocol == config.ProtocolTorrent {
			attemptCtx, cancel := context.WithTimeout(ctx, repairStopFinalRepairTimeout)
			err = r.backend.ReinsertEntry(attemptCtx, entry)
			cancel()
			if ctx.Err() != nil {
				return false, ctx.Err()
			}
			// Even a successful provider reinsertion does not prove the path reads.
			if err == nil {
				result = r.probeLibraryPath(ctx, broken.SourcePath)
				if result.status == storage.HealthHealthy {
					return true, nil
				}
				if result.status != storage.HealthBroken {
					return false, fmt.Errorf("%s", result.reason)
				}
			}
		}
	}
	return false, nil
}

// A worker reads each season sequentially so no sibling probe can start after a
// confirmed failure. Unrelated seasons and movies keep using separate workers.
func groupLibraryAuditFiles(files []*storage.EntryHealth, replaceWholeSeason bool) [][]*storage.EntryHealth {
	type seasonKey struct {
		arrName        string
		arrFingerprint string
		seriesID       int
		seasonNumber   int
	}

	var groups [][]*storage.EntryHealth
	seasonGroups := make(map[seasonKey]int)
	for _, health := range files {
		file := health.LibraryFile
		if !replaceWholeSeason || file == nil || file.ArrKind != storage.ArrKindSonarr ||
			file.ArrName == "" || file.MediaID <= 0 || file.SeasonNumber < 0 || len(file.EpisodeIDs) == 0 {
			groups = append(groups, []*storage.EntryHealth{health})
			continue
		}

		key := seasonKey{file.ArrName, file.ArrFingerprint, file.MediaID, file.SeasonNumber}
		if index, exists := seasonGroups[key]; exists {
			groups[index] = append(groups[index], health)
			continue
		}

		seasonGroups[key] = len(groups)
		groups = append(groups, []*storage.EntryHealth{health})
	}
	return groups
}
