package reacquire

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sirrobot01/decypharr/pkg/arr"
)

func TestSeasonPackFirstSelectsOnlyEligiblePackOrSearchesEpisodes(t *testing.T) {
	for _, test := range []struct {
		name     string
		releases string
		wantGUID string
	}{
		{name: "pack after higher ranked episode", releases: `[
			{"guid":"episode","fullSeason":false,"indexer":"test","indexerId":1,"downloadAllowed":true},
			{"guid":"pack","fullSeason":true,"seasonNumber":2,"mappedSeriesId":7,"indexer":"test","indexerId":1,"downloadAllowed":true}]`, wantGUID: "pack"},
		{name: "mapped season", releases: `[{"guid":"mapped-pack","fullSeason":true,"seasonNumber":1,"mappedSeasonNumber":2,"mappedSeriesId":7,"indexer":"test","indexerId":1,"approved":true}]`, wantGUID: "mapped-pack"},
		{name: "no releases", releases: `[]`},
		{name: "episode only", releases: `[{"guid":"episode","fullSeason":false,"seasonNumber":2,"indexer":"test","indexerId":1,"downloadAllowed":true}]`},
		{name: "rejected pack", releases: `[{"guid":"pack","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"downloadAllowed":true,"rejections":["quality"]}]`},
		{name: "wrong season", releases: `[{"guid":"pack","fullSeason":true,"seasonNumber":3,"indexer":"test","indexerId":1,"downloadAllowed":true}]`},
		{name: "missing season", releases: `[{"guid":"pack","fullSeason":true,"indexer":"test","indexerId":1,"downloadAllowed":true}]`},
		{name: "wrong series", releases: `[{"guid":"pack","fullSeason":true,"seasonNumber":2,"mappedSeriesId":8,"indexer":"test","indexerId":1,"downloadAllowed":true}]`},
		{name: "multi season release", releases: `[{"guid":"pack","fullSeason":true,"seasonNumber":2,"seasonNumbers":[2,3],"indexer":"test","indexerId":1,"downloadAllowed":true}]`},
		{name: "original torrent", releases: `[{"guid":"old-pack","infoHash":"OLD-HASH","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"downloadAllowed":true}]`},
	} {
		t.Run(test.name, func(t *testing.T) {
			var grabbed string
			var searches int
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.Method == http.MethodGet && r.URL.Path == "/api/v3/release":
					if r.URL.Query().Get("seriesId") != "7" || r.URL.Query().Get("seasonNumber") != "2" || r.URL.Query().Has("episodeId") {
						t.Errorf("expected season release lookup, got %s", r.URL.String())
					}
					fmt.Fprint(w, test.releases)
				case r.Method == http.MethodPost && r.URL.Path == "/api/v3/release":
					var release arr.Release
					if err := json.NewDecoder(r.Body).Decode(&release); err != nil {
						t.Error(err)
					}
					grabbed = release.GUID
					w.WriteHeader(http.StatusCreated)
				case r.Method == http.MethodPost && r.URL.Path == "/api/v3/command":
					var command arr.CommandBody
					if err := json.NewDecoder(r.Body).Decode(&command); err != nil {
						t.Error(err)
					}
					if command.Name != "EpisodeSearch" || !equalNormalizedIDs(command.EpisodeIDs, []int{41, 42}) {
						t.Errorf("fallback command = %#v", command)
					}
					searches++
					w.WriteHeader(http.StatusCreated)
					fmt.Fprint(w, `{"id":71,"name":"EpisodeSearch"}`)
				default:
					t.Errorf("unexpected request: %s %s", r.Method, r.URL)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			handler, instance := seasonTestHandler(server.URL)
			job := Job{DownloadID: "old-hash"}
			status, err := handler.seasonPackFirst(t.Context(), instance, &job, seasonTestBindings(), &recordedProgress{})
			if err != nil {
				t.Fatal(err)
			}
			if grabbed != test.wantGUID {
				t.Fatalf("grabbed = %q, want %q", grabbed, test.wantGUID)
			}
			if test.wantGUID != "" {
				if searches != 0 || status != StatusWaitingForDownload {
					t.Fatalf("searches=%d status=%s", searches, status)
				}
			} else if searches != 1 || status != StatusWaitingForGrab {
				t.Fatalf("searches=%d status=%s", searches, status)
			}
		})
	}
}

func TestSeasonPackFirstDoesNotFallbackOnAPIOrGrabError(t *testing.T) {
	for _, failGrab := range []bool{false, true} {
		t.Run(fmt.Sprintf("grab=%v", failGrab), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/api/v3/command" {
					t.Error("episode fallback after API failure")
				}
				if r.Method == http.MethodGet && failGrab {
					fmt.Fprint(w, `[{"guid":"pack","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"downloadAllowed":true}]`)
					return
				}
				http.Error(w, "unavailable", http.StatusBadRequest)
			}))
			defer server.Close()
			handler, instance := seasonTestHandler(server.URL)
			if _, err := handler.seasonPackFirst(t.Context(), instance, &Job{}, seasonTestBindings(), &recordedProgress{}); err == nil {
				t.Fatal("expected failure")
			}
		})
	}
}

func TestSeasonPackFirstUsesSeasonLookupForSingleEpisode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			if r.URL.Query().Get("seasonNumber") != "2" || r.URL.Query().Has("episodeId") {
				t.Errorf("expected season lookup for a single bound episode: %s", r.URL)
			}
			fmt.Fprint(w, `[{"guid":"pack","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"approved":true}]`)
			return
		}
		if r.URL.Path != "/api/v3/release" {
			t.Errorf("unexpected fallback: %s", r.URL)
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()
	handler, instance := seasonTestHandler(server.URL)
	if status, err := handler.seasonPackFirst(t.Context(), instance, &Job{}, seasonTestBindings()[:1], &recordedProgress{}); err != nil || status != StatusWaitingForDownload {
		t.Fatalf("status=%s err=%v", status, err)
	}
}

func TestSeasonPackFirstFallsBackForMultiSeasonDownload(t *testing.T) {
	var searches int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v3/command" {
			t.Errorf("multi-season download must not select a single season pack: %s %s", r.Method, r.URL)
			http.NotFound(w, r)
			return
		}
		searches++
		var command arr.CommandBody
		if err := json.NewDecoder(r.Body).Decode(&command); err != nil {
			t.Error(err)
		}
		if command.Name != "EpisodeSearch" || !equalNormalizedIDs(command.EpisodeIDs, []int{41, 42}) {
			t.Errorf("fallback=%#v", command)
		}
		fmt.Fprint(w, `{"id":71,"name":"EpisodeSearch"}`)
	}))
	defer server.Close()
	handler, instance := seasonTestHandler(server.URL)
	bindings := seasonTestBindings()
	bindings[1].SeasonNumber = 3
	if status, err := handler.seasonPackFirst(t.Context(), instance, &Job{}, bindings, &recordedProgress{}); err != nil || status != StatusWaitingForGrab || searches != 1 {
		t.Fatalf("status=%s searches=%d err=%v", status, searches, err)
	}
}

func TestSeasonPackFirstHandlerAvoidsSonarrAutomaticFailedDownloadSearch(t *testing.T) {
	configureArrHTTPTest(t)
	var deleted, grabbed bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v3/config/downloadclient":
			fmt.Fprint(w, `{"enableCompletedDownloadHandling":true,"autoRedownloadFailed":true}`)
		case r.Method == http.MethodGet && r.URL.Path == "/api/v3/episodefile/10":
			fmt.Fprint(w, `{"id":10,"seriesId":7,"seasonNumber":2,"path":"/tv/episode.mkv"}`)
		case r.Method == http.MethodGet && r.URL.Path == "/api/v3/episode":
			fmt.Fprint(w, `[{"id":41,"episodeFileId":10,"seriesId":7,"seasonNumber":2}]`)
		case r.Method == http.MethodDelete && r.URL.Path == "/api/v3/episodefile/10":
			deleted = true
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/api/v3/release":
			if !deleted {
				t.Error("searched before deleting old file")
			}
			fmt.Fprint(w, `[{"guid":"pack","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"approved":true}]`)
		case r.Method == http.MethodPost && r.URL.Path == "/api/v3/release":
			grabbed = true
			w.WriteHeader(http.StatusCreated)
		default:
			t.Errorf("unexpected request, including any history failure or episode search: %s %s", r.Method, r.URL)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	handler, instance := seasonTestHandler(server.URL)
	binding := seasonTestBindings()[0]
	binding.ArrName, binding.ArrInstanceFingerprint = instance.Name, instance.Fingerprint()
	binding.EntryID, binding.EntryFileID = "old-pack", "file"
	binding.LibraryPath, binding.ArrFileID, binding.Confidence = "/tv/episode.mkv", 10, ConfidenceExactPath
	job := Job{ArrName: instance.Name, ArrType: arr.Sonarr, EntryID: binding.EntryID, FileID: binding.EntryFileID, DownloadID: "old-hash", Strategy: StrategySeasonPackFirst, Bindings: []Binding{binding}}
	if err := handler.Reacquire(t.Context(), job, &recordedProgress{}); err != nil {
		t.Fatal(err)
	}
	if !deleted || !grabbed {
		t.Fatalf("deleted=%v grabbed=%v", deleted, grabbed)
	}
}

func TestSeasonPackFirstResumesConfirmedMutationWithoutAnotherSearch(t *testing.T) {
	for _, kind := range []MutationKind{MutationReleaseGrab, MutationEpisodeSearch} {
		t.Run(string(kind), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				t.Errorf("redispatched %s %s", r.Method, r.URL)
				http.NotFound(w, r)
			}))
			defer server.Close()
			handler, instance := seasonTestHandler(server.URL)
			mutation := Mutation{Kind: kind, State: MutationConfirmed}
			if kind == MutationEpisodeSearch {
				mutation.Key = mutationKey(kind, "41,42")
			}
			job := Job{Mutations: []Mutation{mutation}}
			if _, err := handler.seasonPackFirst(t.Context(), instance, &job, seasonTestBindings(), &recordedProgress{}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestSonarrHealthRepairUsesSeasonPackPolicyAndGroupsDownload(t *testing.T) {
	service, err := NewService(ServiceOptions{Directory: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = service.Close() })
	if err := service.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	bindings := seasonTestBindings()
	for i := range bindings {
		bindings[i].ArrName = "sonarr"
		bindings[i].ArrInstanceFingerprint = "test"
		bindings[i].EntryID = "pack"
		bindings[i].EntryFileID = fmt.Sprint(i)
		bindings[i].ArrFileID = i + 1
		bindings[i].LibraryPath = fmt.Sprintf("/tv/%d.mkv", i)
		bindings[i].Confidence = ConfidenceExactPath
		bindings[i].DownloadID = "download"
		if err := service.UpsertBinding(bindings[i]); err != nil {
			t.Fatal(err)
		}
	}
	job, err := service.Reacquire(Request{EntryID: "pack", FileID: "0", Cause: CauseRepair})
	if err != nil {
		t.Fatal(err)
	}
	if job.Strategy != StrategySeasonPackFirst || len(job.Bindings) != 2 {
		t.Fatalf("job=%#v", job)
	}
	duplicate, err := service.Reacquire(Request{EntryID: "pack", FileID: "1", Cause: CauseRepair})
	if err != nil || duplicate.ID != job.ID {
		t.Fatalf("duplicate=%#v err=%v", duplicate, err)
	}
}

func seasonTestBindings() []Binding {
	return []Binding{{ArrType: arr.Sonarr, SeriesID: 7, SeasonNumber: 2, EpisodeIDs: []int{41}}, {ArrType: arr.Sonarr, SeriesID: 7, SeasonNumber: 2, EpisodeIDs: []int{42}}}
}

func seasonTestHandler(host string) (*arrHandler, arr.Arr) {
	instance := arr.Arr{Name: "sonarr", Host: host, Token: "secret", Type: arr.Sonarr}
	registry := arr.New()
	registry.AddOrUpdate(instance)
	return &arrHandler{arrs: registry}, instance
}
