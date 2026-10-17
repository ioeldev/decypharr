package arr

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMediaDisplayDetailsUsesEpisodeNumbersWithoutImportedFiles(t *testing.T) {
	for _, kind := range []Type{Sonarr, Radarr} {
		t.Run(string(kind), func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Method != http.MethodGet {
					t.Errorf("unexpected mutation: %s", r.Method)
				}
				switch r.URL.Path {
				case "/api/v3/series/9", "/api/v3/movie/9":
					fmt.Fprint(w, `{"id":9,"title":"A proper title"}`)
				case "/api/v3/episode":
					if r.URL.Query().Get("seriesId") != "9" {
						t.Error("wrong series")
					}
					fmt.Fprint(w, `[{"id":29464,"seasonNumber":1,"episodeNumber":3,"episodeFileId":0},{"id":8,"seasonNumber":0,"episodeNumber":2}]`)
				default:
					t.Errorf("unexpected path %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			service := testService(Arr{Host: server.URL, Token: "secret", Type: kind})
			result, err := service.MediaDisplayDetails(t.Context(), "arr", "", 9)
			if err != nil || result.Title != "A proper title" {
				t.Fatalf("details=%+v err=%v", result, err)
			}
			if kind == Sonarr && (len(result.Episodes) != 2 || result.Episodes[0].ID != 29464 || result.Episodes[0].EpisodeNumber != 3 || result.Episodes[1].SeasonNumber != 0) {
				t.Fatalf("episodes=%+v", result.Episodes)
			}
			if kind == Radarr && (len(result.Episodes) != 0 || calls != 1) {
				t.Fatalf("movie=%+v calls=%d", result, calls)
			}
			before := calls
			if _, err = service.MediaDisplayDetails(t.Context(), "arr", "outdated-instance", 9); err == nil {
				t.Error("accepted stale instance")
			}
			if _, err = service.MediaDisplayDetails(t.Context(), "arr", "", 0); err == nil {
				t.Error("accepted invalid ID")
			}
			if calls != before {
				t.Error("invalid identity contacted Arr")
			}
		})
	}
}

func TestMediaDisplayDetailsRejectsMismatchedMedia(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"id":10,"title":"Wrong movie"}`) }))
	defer server.Close()
	service := testService(Arr{Host: server.URL, Token: "secret", Type: Radarr})
	if _, err := service.MediaDisplayDetails(t.Context(), "arr", "", 9); err == nil {
		t.Fatal("accepted unrelated media")
	}
}
