package reacquire

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

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
	if _, err := service.ReacquireLibraryFile(t.Context(), LibraryRequest{ArrName: "shows", ArrFileID: 43, LibraryPath: "/library/second.mkv", Cause: CauseRepair}); err == nil {
		t.Fatal("second orphan queued a competing season-pack grab")
	}
	if len(service.Jobs()) != 1 {
		t.Fatal("duplicate season recovery job")
	}
}
