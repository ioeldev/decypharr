package server

import (
	"cmp"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/sirrobot01/decypharr/pkg/arr/reacquire"
	"github.com/sirrobot01/decypharr/pkg/storage"
	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

var librarySeasonDirectory = regexp.MustCompile(`(?i)^(?:season|saison)\s+(\d+)$`)
var librarySeasonFilename = regexp.MustCompile(`(?i)(?:^|[ ._-])S(\d+)E\d+(?:$|[ ._-])`)

// Library pages contain bounded summaries; recovery history and bindings are not
// duplicated into every finding. Pagination counts files, including within seasons.
type libraryFinding struct {
	Health   *storage.EntryHealth `json:"health"`
	Job      *reacquire.Job       `json:"job"`
	File     storage.BrokenFile   `json:"file"`
	Label    string               `json:"label"`
	Category string               `json:"category"`
	Season   *int                 `json:"season"`
}

type libraryPageOptions struct {
	Page, Limit          int
	Search, Status, Sort string
}
type libraryFindingsPage struct {
	Findings   []libraryFinding `json:"findings"`
	Total      int              `json:"total"`
	Page       int              `json:"page"`
	Limit      int              `json:"limit"`
	MaxRetries int              `json:"maxRetries"`
}

type libraryIdentity struct {
	Arr, Fingerprint, Kind string
	Media, Episode         int
}

func parseLibraryPage(values url.Values) (libraryPageOptions, error) {
	options := libraryPageOptions{Page: 1, Limit: 50, Search: strings.ToLower(strings.TrimSpace(values.Get("search"))), Status: values.Get("status"), Sort: values.Get("sort")}
	for name, target := range map[string]*int{"page": &options.Page, "limit": &options.Limit} {
		if value := values.Get(name); value != "" {
			parsed, err := strconv.Atoi(value)
			if err != nil || parsed < 1 {
				return options, fmt.Errorf("%s must be a positive integer", name)
			}
			*target = parsed
		}
	}
	options.Limit = min(options.Limit, 100)
	if !slices.Contains([]string{"", "all", "pending", "active", "attention", "resolved"}, options.Status) {
		return options, fmt.Errorf("invalid finding status")
	}
	if !slices.Contains([]string{"", "changed", "checked", "name", "retry"}, options.Sort) {
		return options, fmt.Errorf("invalid finding sort")
	}
	return options, nil
}

func paginateLibraryFindings(findings []libraryFinding, options libraryPageOptions) libraryFindingsPage {
	filtered := make([]libraryFinding, 0, len(findings))
	for _, finding := range findings {
		if options.Status != "" && options.Status != "all" && options.Status != finding.Category {
			continue
		}
		searchable := finding.Label + " " + finding.File.ArrName + " " + finding.File.SourcePath
		if finding.Health != nil {
			searchable += " " + finding.Health.FailureReason
		}
		if finding.Job != nil {
			searchable += " " + finding.Job.LastError
		}
		if !strings.Contains(strings.ToLower(searchable), options.Search) {
			continue
		}
		filtered = append(filtered, finding)
	}
	nameOrder := collate.New(language.Und, collate.Numeric, collate.IgnoreCase)
	slices.SortStableFunc(filtered, func(first, second libraryFinding) int {
		switch options.Sort {
		case "name":
			return nameOrder.CompareString(first.Label, second.Label)
		case "checked":
			return findingCheckedAt(second).Compare(findingCheckedAt(first))
		case "retry":
			return findingRetryAt(first).Compare(findingRetryAt(second))
		default:
			return findingChangedAt(second).Compare(findingChangedAt(first))
		}
	})
	total := len(filtered)
	page := min(options.Page, max(1, (total+options.Limit-1)/options.Limit))
	start := (page - 1) * options.Limit
	return libraryFindingsPage{Findings: filtered[start:min(start+options.Limit, total)], Total: total, Page: page, Limit: options.Limit}
}

func buildLibraryFindings(incidents []*storage.EntryHealth, jobs []reacquire.Job) []libraryFinding {
	// Index incidents by both Arr file ID and stable media identity: a replacement
	// has a new file ID but must still join the original incident.
	incidentIndex := make(map[libraryIdentity][]int)
	findings := make([]libraryFinding, 0, len(incidents))
	for _, health := range incidents {
		if health.LibraryFile == nil {
			continue
		}
		index := len(findings)
		findings = append(findings, newLibraryFinding(health, nil, *health.LibraryFile))
		for _, key := range libraryFileIdentities(*health.LibraryFile) {
			incidentIndex[key] = append(incidentIndex[key], index)
		}
	}
	slices.SortFunc(jobs, func(first, second reacquire.Job) int {
		if comparison := first.CreatedAt.Compare(second.CreatedAt); comparison != 0 {
			return comparison
		}
		return cmp.Compare(first.ID, second.ID)
	})
	for _, job := range jobs {
		if job.Cause != reacquire.CauseRepair {
			continue
		}
		matched := false
		isLibrary := job.LibraryAudit
		for _, binding := range job.Bindings {
			if binding.Confidence == reacquire.ConfidenceLibraryFile {
				isLibrary = true
			}
			for _, key := range libraryBindingIdentities(binding) {
				for _, index := range incidentIndex[key] {
					findings[index] = newLibraryFinding(findings[index].Health, &job, findings[index].File)
					if findings[index].File.SeasonNumber == 0 && binding.SeasonNumber > 0 {
						season := binding.SeasonNumber
						findings[index].Season = &season
					}
					matched = true
				}
			}
		}
		if matched || !isLibrary {
			continue
		}
		for _, binding := range job.Bindings {
			file := storage.BrokenFile{ArrName: binding.ArrName, ArrFingerprint: binding.ArrInstanceFingerprint, ArrKind: storage.ArrKind(binding.ArrType), MediaID: binding.MovieID, SeasonNumber: binding.SeasonNumber, SourcePath: binding.LibraryPath, ArrFileID: binding.ArrFileID}
			if file.MediaID == 0 {
				file.MediaID = binding.SeriesID
			}
			if len(binding.EpisodeIDs) > 0 {
				file.EpisodeID = binding.EpisodeIDs[0]
			}
			findings = append(findings, newLibraryFinding(nil, &job, file))
		}
	}
	return findings
}

func libraryFileIdentities(file storage.BrokenFile) []libraryIdentity {
	keys := make([]libraryIdentity, 0, 2)
	if file.ArrFileID > 0 {
		keys = append(keys, libraryIdentity{file.ArrName, file.ArrFingerprint, "file", file.ArrFileID, 0})
	}
	if file.MediaID > 0 && file.ArrKind == storage.ArrKindRadarr {
		keys = append(keys, libraryIdentity{file.ArrName, file.ArrFingerprint, "movie", file.MediaID, 0})
	}
	if file.MediaID > 0 && file.EpisodeID > 0 && file.ArrKind == storage.ArrKindSonarr {
		keys = append(keys, libraryIdentity{file.ArrName, file.ArrFingerprint, "episode", file.MediaID, file.EpisodeID})
	}
	return keys
}

func libraryBindingIdentities(binding reacquire.Binding) []libraryIdentity {
	keys := libraryFileIdentities(storage.BrokenFile{ArrName: binding.ArrName, ArrFingerprint: binding.ArrInstanceFingerprint, ArrFileID: binding.ArrFileID, ArrKind: storage.ArrKindRadarr, MediaID: binding.MovieID})
	for _, episode := range binding.EpisodeIDs {
		keys = append(keys, libraryIdentity{binding.ArrName, binding.ArrInstanceFingerprint, "episode", binding.SeriesID, episode})
	}
	return keys
}

func newLibraryFinding(health *storage.EntryHealth, job *reacquire.Job, file storage.BrokenFile) libraryFinding {
	finding := libraryFinding{File: file, Category: "pending"}
	finding.Label = path.Base(path.Dir(file.SourcePath)) + " / " + path.Base(file.SourcePath)
	if file.SourcePath == "" {
		finding.Label = fmt.Sprintf("Media %d", file.MediaID)
	}
	if health != nil {
		summary := *health
		summary.BrokenFiles = nil
		summary.LibraryFile = nil
		finding.Health = &summary
		if health.DisplayName != "" {
			finding.Label = health.DisplayName
		}
	}
	if job != nil {
		summary := *job
		summary.Bindings = nil
		summary.Attempts = nil
		summary.Mutations = nil
		summary.ReplacementDownloadIDs = nil
		finding.Job = &summary
	}
	finding.Season = libraryFindingSeason(file)
	if health != nil && health.Status == storage.HealthHealthy && !health.LastFailedAt.IsZero() && (job == nil || job.Status == "ready" || job.Status == "cancelled") {
		finding.Category = "resolved"
		return finding
	}
	if job == nil {
		return finding
	}
	switch job.Status {
	case "needs_attention", "failed":
		finding.Category = "attention"
	case "resolving", "invalidating", "blocklisting", "searching", "waiting_for_grab", "waiting_for_download", "waiting_for_import", "ready":
		finding.Category = "active"
	}
	return finding
}

func libraryFindingSeason(file storage.BrokenFile) *int {
	if file.SeasonNumber > 0 {
		return &file.SeasonNumber
	}
	parent := path.Base(path.Dir(file.SourcePath))
	match := librarySeasonDirectory.FindStringSubmatch(parent)
	if match == nil {
		match = librarySeasonFilename.FindStringSubmatch(path.Base(file.SourcePath))
	}
	if match != nil {
		season, _ := strconv.Atoi(match[1])
		return &season
	}
	if strings.EqualFold(parent, "specials") {
		season := 0
		return &season
	}
	return nil
}

func findingChangedAt(finding libraryFinding) time.Time {
	changed := time.Time{}
	if finding.Health != nil {
		changed = finding.Health.StatusChangedAt
		if changed.IsZero() {
			changed = finding.Health.LastFailedAt
			if finding.Health.LastOKAt.After(changed) {
				changed = finding.Health.LastOKAt
			}
		}
	}
	if finding.Job != nil {
		for _, candidate := range []time.Time{finding.Job.PhaseStartedAt, finding.Job.CompletedAt, finding.Job.StartedAt, finding.Job.CreatedAt} {
			if candidate.IsZero() {
				continue
			}
			if candidate.After(changed) {
				changed = candidate
			}
			break
		}
	}
	return changed
}
func findingCheckedAt(finding libraryFinding) time.Time {
	if finding.Health != nil {
		return finding.Health.LastCheckedAt
	}
	return time.Time{}
}
func findingRetryAt(finding libraryFinding) time.Time {
	if finding.Job != nil && !finding.Job.RetryAt.IsZero() {
		return finding.Job.RetryAt
	}
	return time.Date(9999, 1, 1, 0, 0, 0, 0, time.UTC)
}
