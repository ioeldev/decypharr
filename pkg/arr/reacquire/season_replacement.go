package reacquire

import (
	"context"
	"fmt"
	"reflect"
	"strconv"

	"github.com/sirrobot01/decypharr/pkg/arr"
)

// snapshotSeason adds only authoritative imported files from this exact season.
// Missing original files remain in the snapshot for import confirmation.
func (handler *arrHandler) snapshotSeason(ctx context.Context, instance arr.Arr, job Job, progress JobProgress) (Job, error) {
	_, series, season := sonarrTargets(job.Bindings)
	if instance.Type != arr.Sonarr || series <= 0 || season < 0 || !singleSonarrSeason(job.Bindings, series, season) {
		return job, nil
	}
	files, err := handler.arrs.LibraryFilesForMedia(ctx, instance.Name, []int{series})
	if err != nil {
		return job, err
	}
	bindings := cloneJob(job).Bindings
	known := map[int]bool{}
	for _, b := range bindings {
		known[b.ArrFileID] = true
	}
	for _, f := range files {
		if f.SeriesID != series || f.SeasonNumber != season || known[f.ArrFileID] {
			continue
		}
		id := strconv.Itoa(f.ArrFileID)
		bindings = append(bindings, Binding{
			ArrName: instance.Name, ArrType: instance.Type, ArrInstanceFingerprint: instance.Fingerprint(),
			EntryID: "arr-library:" + instance.Fingerprint() + ":" + id, EntryFileID: id,
			ArrFileID: f.ArrFileID, LibraryPath: f.Path, SeriesID: f.SeriesID,
			SeasonNumber: f.SeasonNumber, EpisodeIDs: f.EpisodeIDs, Confidence: ConfidenceLibraryFile,
		})
		known[f.ArrFileID] = true
	}
	if err := validateSeasonSnapshot(job, bindings); err != nil {
		return job, err
	}
	if err := progress.UpdateDurable(StatusResolving, func(current *Job) {
		current.Bindings = bindings
		current.WholeSeasonReplacement = true
	}); err != nil {
		return job, fmt.Errorf("persist season replacement before deletion: %w", err)
	}
	job.Bindings = bindings
	job.WholeSeasonReplacement = true
	return job, nil
}

func validateSeasonSnapshot(original Job, bindings []Binding) error {
	_, series, season := sonarrTargets(original.Bindings)
	if original.Cause != CauseRepair || original.Strategy != StrategySeasonPackFirst ||
		original.ArrType != arr.Sonarr || series <= 0 || season < 0 || len(original.Bindings) == 0 || len(bindings) < len(original.Bindings) {
		return ErrBindingUnsafe
	}
	// Existing immutable bindings must be retained byte-for-byte in order.
	for i, b := range original.Bindings {
		if !reflect.DeepEqual(b, bindings[i]) {
			return ErrBindingUnsafe
		}
	}
	for _, b := range bindings {
		if !b.AuthorizesMutation() || b.ArrName != original.ArrName || b.ArrType != arr.Sonarr ||
			b.ArrInstanceFingerprint != original.Bindings[0].ArrInstanceFingerprint ||
			b.SeriesID != series || b.SeasonNumber != season || len(b.EpisodeIDs) == 0 {
			return ErrBindingUnsafe
		}
	}
	return nil
}
