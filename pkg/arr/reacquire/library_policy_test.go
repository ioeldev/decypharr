package reacquire

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
)

func TestUnindexedLibraryEpisodeUsesSeasonPackPolicy(t *testing.T) {
	configureArrHTTPTest(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v3/episodefile/42":
			fmt.Fprint(w, `{"id":42,"seriesId":7,"seasonNumber":2,"path":"/library/episode.mkv"}`)
		case "/api/v3/episodefile/43":
			fmt.Fprint(w, `{"id":43,"seriesId":7,"seasonNumber":2,"path":"/library/second.mkv"}`)
		case "/api/v3/episode":
			fmt.Fprint(w, `[{"id":41,"episodeFileId":42},{"id":42,"episodeFileId":43}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	registry := arr.New()
	registry.AddOrUpdate(arr.Arr{Name: "shows", Type: arr.Sonarr, Host: server.URL, Token: "test"})
	service, err := NewService(ServiceOptions{Directory: t.TempDir(), Arrs: registry})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = service.Close() })
	if err := service.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	job, err := service.ReacquireLibraryFile(t.Context(), LibraryRequest{ArrName: "shows", ArrFileID: 42, LibraryPath: "/library/episode.mkv", Cause: CauseRepair})
	if err != nil {
		t.Fatal(err)
	}
	if job.Strategy != StrategySeasonPackFirst || len(job.Bindings) != 1 || job.Bindings[0].SeriesID != 7 || job.Bindings[0].SeasonNumber != 2 || len(job.Bindings[0].EpisodeIDs) != 1 || job.Bindings[0].EpisodeIDs[0] != 41 {
		t.Fatalf("orphan episode job lost pack policy/identity: %+v", job)
	}
	second, err := service.ReacquireLibraryFile(t.Context(), LibraryRequest{ArrName: "shows", ArrFileID: 43, LibraryPath: "/library/second.mkv", Cause: CauseRepair})
	if err != nil || len(service.Jobs()) != 2 {
		t.Fatalf("second orphan was not retained in the queue: %v", err)
	}
	if _, err := service.updateJobDurable(job.ID, StatusWaitingForImport, nil); err != nil {
		t.Fatal(err)
	}
	if next, ok := service.nextJob(); ok && next.ID == second.ID {
		t.Fatal("competing orphan season recovery became dispatchable")
	}
	if _, err := service.updateJobDurable(job.ID, StatusReady, nil); err != nil {
		t.Fatal(err)
	}
	if next, ok := service.nextJob(); !ok || next.ID != second.ID {
		t.Fatal("queued orphan did not resume after the season recovered")
	}
}

func TestWholeSeasonLibraryRepairScopesMultiSeasonDownloads(t *testing.T) {
	for _, replaceWholeSeason := range []bool{false, true} {
		t.Run(fmt.Sprintf("replace_whole_season=%v", replaceWholeSeason), func(t *testing.T) {
			configureArrHTTPTest(t)
			if _, err := config.Update(func(settings *config.Config) error {
				settings.Repair.ReplaceWholeSeason = replaceWholeSeason
				return nil
			}); err != nil {
				t.Fatal(err)
			}
			instance := arr.Arr{Name: "shows", Type: arr.Sonarr, Host: "http://unused.test", Token: "test"}
			registry := arr.New()
			registry.AddOrUpdate(instance)
			service, err := NewService(ServiceOptions{Directory: t.TempDir(), Arrs: registry})
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = service.Close() })
			if err := service.Start(t.Context()); err != nil {
				t.Fatal(err)
			}

			for index := range 4 {
				binding := Binding{
					ArrName: instance.Name, ArrType: arr.Sonarr, ArrInstanceFingerprint: instance.Fingerprint(),
					EntryID: "multi-season", EntryFileID: fmt.Sprint(index), ArrFileID: index + 1,
					LibraryPath: fmt.Sprintf("/tv/%d.mkv", index), DownloadID: "download",
					SeriesID: 7, SeasonNumber: 2, EpisodeIDs: []int{index + 41}, Confidence: ConfidenceExactPath,
				}
				if index == 2 {
					binding.SeasonNumber = 3
				}
				if index == 3 {
					binding.SeriesID = 8
				}
				if err := service.UpsertBinding(binding); err != nil {
					t.Fatal(err)
				}
			}

			job, err := service.ReacquireLibraryFile(t.Context(), LibraryRequest{
				ArrName: instance.Name, ArrFileID: 1, LibraryPath: "/tv/0.mkv", Cause: CauseRepair,
			})
			if err != nil {
				t.Fatal(err)
			}
			wantBindings := 4
			if replaceWholeSeason {
				wantBindings = 2
			}
			if job.Strategy != StrategySeasonPackFirst || !job.LibraryAudit || len(job.Bindings) != wantBindings {
				t.Fatalf("unexpected library repair: %+v", job)
			}
			if !replaceWholeSeason {
				return
			}
			for _, binding := range job.Bindings {
				if binding.SeriesID != 7 || binding.SeasonNumber != 2 {
					t.Fatalf("unrelated season included: %+v", binding)
				}
			}
		})
	}
}
