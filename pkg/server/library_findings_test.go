package server

import (
	"encoding/json"
	"fmt"
	"net/url"
	"testing"
	"time"

	"github.com/sirrobot01/decypharr/pkg/arr"
	"github.com/sirrobot01/decypharr/pkg/arr/reacquire"
	"github.com/sirrobot01/decypharr/pkg/storage"
)

func TestLibraryFindingReplacementIdentity(t *testing.T) {
	health := &storage.EntryHealth{Status: storage.HealthBroken, LastFailedAt: time.Now(), LibraryFile: &storage.BrokenFile{ArrName: "movies", ArrFingerprint: "a", ArrKind: storage.ArrKindRadarr, MediaID: 9, ArrFileID: 43}}
	job := reacquire.Job{ID: "job", Cause: reacquire.CauseRepair, Status: "ready", Bindings: []reacquire.Binding{{ArrName: "movies", ArrInstanceFingerprint: "a", MovieID: 9, ArrFileID: 42}}}
	finding := buildLibraryFindings([]*storage.EntryHealth{health}, []reacquire.Job{job})[0]
	if finding.Job == nil || finding.Category != "active" {
		t.Fatal("replacement must join; import alone is not proof of health")
	}
	health.Status = storage.HealthHealthy
	if buildLibraryFindings([]*storage.EntryHealth{health}, []reacquire.Job{job})[0].Category != "resolved" {
		t.Fatal("verified read must resolve finding")
	}
	job.Bindings[0].ArrInstanceFingerprint = "changed"
	if buildLibraryFindings([]*storage.EntryHealth{health}, []reacquire.Job{job})[0].Job != nil {
		t.Fatal("different Arr instance matched")
	}
}

func TestLibraryFindingSeasonsAndChanges(t *testing.T) {
	for _, test := range []struct {
		Path   string
		Season int
	}{{"Season 1/file.mkv", 1}, {"Season 2/file.mkv", 2}, {"Example.S03E01.mkv", 3}, {"file.mkv", -1}, {"Specials/file.mkv", 0}} {
		season := libraryFindingSeason(storage.BrokenFile{SourcePath: "/tv/Example/" + test.Path})
		if test.Season < 0 {
			if season != nil {
				t.Fatal("unknown season must remain unknown")
			}
			continue
		}
		if season == nil || *season != test.Season {
			t.Fatalf("wrong season for %s", test.Path)
		}
	}
	changed := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	finding := libraryFinding{Health: &storage.EntryHealth{StatusChangedAt: changed, UpdatedAt: changed.Add(time.Hour), LastCheckedAt: changed.Add(time.Hour)}}
	if !findingChangedAt(finding).Equal(changed) {
		t.Fatal("observation changed sort time")
	}
}

func TestLibraryFindingPagination(t *testing.T) {
	incidents, jobs := largeLibraryFindings(10000)
	findings := buildLibraryFindings(incidents, jobs)
	options, err := parseLibraryPage(url.Values{"limit": {"1000000"}, "page": {"999999999"}})
	if err != nil || options.Limit != 100 {
		t.Fatal(options, err)
	}
	page := paginateLibraryFindings(findings, options)
	if page.Total != 10000 || len(page.Findings) != 100 || page.Page != 100 {
		t.Fatalf("unexpected page: total=%d page=%d size=%d", page.Total, page.Page, len(page.Findings))
	}
	payload, err := json.Marshal(page)
	if err != nil || len(payload) > 300000 {
		t.Fatalf("page payload should stay bounded: %d bytes, %v", len(payload), err)
	}
	for _, finding := range page.Findings {
		if finding.Job == nil || len(finding.Job.Bindings) != 0 || len(finding.Job.Attempts) != 0 {
			t.Fatal("missing job or duplicated detail")
		}
	}
	options = libraryPageOptions{Page: 1, Limit: 50, Search: "episode 09999", Status: "active", Sort: "name"}
	page = paginateLibraryFindings(findings, options)
	if page.Total != 1 || page.Findings[0].Label != "Episode 09999" {
		t.Fatal("search must cover records beyond first page")
	}
	options.Status = "resolved"
	page = paginateLibraryFindings(findings, options)
	if page.Total != 0 || page.Page != 1 || page.Findings == nil {
		t.Fatal("invalid empty page")
	}
	for _, values := range []url.Values{{"page": {"-1"}}, {"limit": {"no"}}, {"sort": {"invalid"}}, {"status": {"invalid"}}} {
		if _, err := parseLibraryPage(values); err == nil {
			t.Fatal("invalid parameters accepted", values)
		}
	}
}

func largeLibraryFindings(count int) ([]*storage.EntryHealth, []reacquire.Job) {
	incidents := make([]*storage.EntryHealth, count)
	jobs := make([]reacquire.Job, count)
	for index := range count {
		file := storage.BrokenFile{ArrName: "shows", ArrFingerprint: "a", ArrKind: storage.ArrKindSonarr, MediaID: 1, EpisodeID: index + 1, SeasonNumber: 1}
		incidents[index] = &storage.EntryHealth{EntryName: fmt.Sprint(index), DisplayName: fmt.Sprintf("Episode %05d", index), Status: storage.HealthBroken, LibraryFile: &file}
		jobs[index] = reacquire.Job{ID: fmt.Sprint(index), Cause: reacquire.CauseRepair, Status: "ready", Bindings: []reacquire.Binding{{ArrName: "shows", ArrInstanceFingerprint: "a", ArrType: arr.Sonarr, SeriesID: 1, EpisodeIDs: []int{index + 1}, SeasonNumber: 1}}}
	}
	return incidents, jobs
}

func BenchmarkLibraryFindingsPage(b *testing.B) {
	incidents, jobs := largeLibraryFindings(10000)
	b.ResetTimer()
	for b.Loop() {
		paginateLibraryFindings(buildLibraryFindings(incidents, jobs), libraryPageOptions{Page: 1, Limit: 50})
	}
}

func TestLibraryFindingsNewestJobAndOrphans(t *testing.T) {
	incidents, jobs := largeLibraryFindings(1)
	older := jobs[0]
	older.ID = "older"
	older.Status = "failed"
	older.CreatedAt = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	newer := older
	newer.ID = "newer"
	newer.Status = "ready"
	newer.CreatedAt = older.CreatedAt.Add(time.Hour)
	orphan := older
	orphan.ID = "orphan"
	orphan.LibraryAudit = true
	orphan.Bindings = []reacquire.Binding{{ArrName: "other", SeriesID: 10, SeasonNumber: 2}}
	findings := buildLibraryFindings(incidents, []reacquire.Job{newer, orphan, older})
	if len(findings) != 2 || findings[0].Job.ID != "newer" || findings[1].Job.ID != "orphan" {
		t.Fatal("expected newest matching job and one orphan")
	}
}

func TestLibraryFindingSortAcrossPages(t *testing.T) {
	findings := []libraryFinding{{Label: "Episode 10", Category: "pending"}, {Label: "Episode 2", Category: "attention"}}
	page := paginateLibraryFindings(findings, libraryPageOptions{Page: 1, Limit: 1, Sort: "name"})
	if page.Total != 2 || page.Findings[0].Label != "Episode 2" {
		t.Fatal("natural ordering must precede pagination")
	}
	changed := time.Now()
	findings[0].Health = &storage.EntryHealth{LastCheckedAt: changed}
	findings[1].Health = &storage.EntryHealth{LastCheckedAt: changed.Add(time.Hour)}
	page = paginateLibraryFindings(findings, libraryPageOptions{Page: 1, Limit: 1, Sort: "checked"})
	if page.Findings[0].Label != "Episode 2" {
		t.Fatal("newest check must sort first")
	}
	findings[1].Job = &reacquire.Job{RetryAt: changed}
	page = paginateLibraryFindings(findings, libraryPageOptions{Page: 1, Limit: 1, Sort: "retry"})
	if page.Findings[0].Label != "Episode 2" {
		t.Fatal("scheduled retries must precede missing dates")
	}
}
