package reacquire

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
)

func TestWholeSeasonReplacementPersistsBeforeDeleteAndProtectsNewImports(t *testing.T) {
	configureArrHTTPTest(t)
	if _, err := config.Update(func(c *config.Config) error { c.Repair.ReplaceWholeSeason = true; return nil }); err != nil {
		t.Fatal(err)
	}
	var service *Service
	deleted := []int{}
	files := map[int]arr.LibraryFile{
		42: {ArrFileID: 42, SeriesID: 7, SeasonNumber: 2, Path: "/tv/S02/one.mkv", EpisodeIDs: []int{41}},
		43: {ArrFileID: 43, SeriesID: 7, SeasonNumber: 2, Path: "/tv/S02/two.mkv", EpisodeIDs: []int{42}},
		44: {ArrFileID: 44, SeriesID: 7, SeasonNumber: 3, Path: "/tv/S03/one.mkv", EpisodeIDs: []int{43}},
	}
	var searched []int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		write := func(v any) {
			if err := json.NewEncoder(w).Encode(v); err != nil {
				t.Error(err)
			}
		}
		fileJSON := func(f arr.LibraryFile) map[string]any {
			return map[string]any{"id": f.ArrFileID, "seriesId": f.SeriesID, "seasonNumber": f.SeasonNumber, "path": f.Path}
		}
		switch {
		case req.URL.Path == "/api/v3/config/downloadclient":
			fmt.Fprint(w, `{"enableCompletedDownloadHandling":true}`)
		case req.URL.Path == "/api/v3/episodefile":
			out := []map[string]any{}
			for _, f := range files {
				out = append(out, fileJSON(f))
			}
			write(out)
		case req.URL.Path == "/api/v3/episode":
			out := []map[string]int{}
			for _, f := range files {
				for _, ep := range f.EpisodeIDs {
					out = append(out, map[string]int{"id": ep, "episodeFileId": f.ArrFileID})
				}
			}
			write(out)
		case strings.HasPrefix(req.URL.Path, "/api/v3/episodefile/"):
			id, _ := strconv.Atoi(strings.TrimPrefix(req.URL.Path, "/api/v3/episodefile/"))
			if req.Method == http.MethodDelete {
				saved, found, err := service.jobRepository.Get("season-job")
				if err != nil || !found || !saved.WholeSeasonReplacement || len(saved.Bindings) != 2 {
					t.Errorf("deletion before durable snapshot: %+v %v", saved, err)
				}
				if id != 42 && id != 43 {
					t.Errorf("deleted unrelated/replacement file %d", id)
				}
				deleted = append(deleted, id)
				delete(files, id)
				w.WriteHeader(http.StatusOK)
			} else if f, ok := files[id]; ok {
				write(fileJSON(f))
			} else {
				http.NotFound(w, req)
			}
		case req.URL.Path == "/api/v3/release":
			if files[42].ArrFileID > 0 || files[43].ArrFileID > 0 {
				t.Error("pack searched before deleting cutoff files")
			}
			if req.URL.Query().Get("seasonNumber") != "2" {
				t.Error("wrong season search")
			}
			fmt.Fprint(w, `[]`)
		case req.URL.Path == "/api/v3/command":
			var body struct {
				Name       string `json:"name"`
				EpisodeIDs []int  `json:"episodeIds"`
			}
			if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if body.Name != "EpisodeSearch" {
				t.Errorf("command %s", body.Name)
			}
			searched = body.EpisodeIDs
			fmt.Fprint(w, `{"id":123,"name":"EpisodeSearch","status":"queued"}`)
		default:
			http.NotFound(w, req)
		}
	}))
	defer server.Close()
	instance := arr.Arr{Name: "shows", Type: arr.Sonarr, Host: server.URL, Token: "test"}
	registry := arr.New()
	registry.AddOrUpdate(instance)
	directory := t.TempDir()
	var err error
	service, err = NewService(ServiceOptions{Directory: directory, Arrs: registry})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = service.Close() }()
	b := Binding{ArrName: instance.Name, ArrType: arr.Sonarr, ArrInstanceFingerprint: instance.Fingerprint(), EntryID: "original", EntryFileID: "42", ArrFileID: 42, LibraryPath: files[42].Path, SeriesID: 7, SeasonNumber: 2, EpisodeIDs: []int{41}, Confidence: ConfidenceLibraryFile}
	job := Job{ID: "season-job", Status: StatusResolving, Cause: CauseRepair, Strategy: StrategySeasonPackFirst, ArrName: instance.Name, ArrType: arr.Sonarr, EntryID: b.EntryID, FileID: b.EntryFileID, Bindings: []Binding{b}, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	service.jobs[job.ID] = job
	progress := &serviceJobProgress{service: service, jobID: job.ID}
	handler := NewHandler(registry)
	if err := handler.Reacquire(t.Context(), job, progress); err != nil {
		t.Fatal(err)
	}
	slices.Sort(deleted)
	if !reflect.DeepEqual(deleted, []int{42, 43}) || !reflect.DeepEqual(searched, []int{41, 42}) {
		t.Fatalf("deleted=%v searched=%v", deleted, searched)
	}
	saved, _, err := service.jobRepository.Get(job.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Reopen the durable store to model a restart between deletion and import.
	if err := service.Close(); err != nil {
		t.Fatal(err)
	}
	service, err = NewService(ServiceOptions{Directory: directory, Arrs: registry})
	if err != nil {
		t.Fatal(err)
	}
	persisted, found, err := service.jobRepository.Get(job.ID)
	if err != nil || !found || !persisted.WholeSeasonReplacement || !reflect.DeepEqual(saved.Bindings, persisted.Bindings) {
		t.Fatalf("snapshot lost on restart: %v", err)
	}
	service.jobs[job.ID] = persisted
	files[142] = arr.LibraryFile{ArrFileID: 142, SeriesID: 7, SeasonNumber: 2, Path: "/tv/S02/new-one.mkv", EpisodeIDs: []int{41}}
	if ready, err := service.jobImported(t.Context(), persisted); err != nil || ready {
		t.Fatalf("partial season marked imported: %v %v", ready, err)
	}
	// A retry must keep the original snapshot, even with a fresh partial import.
	retry, err := service.updateJobDurable(job.ID, StatusResolving, func(j *Job) { j.Mutations = nil })
	if err != nil {
		t.Fatal(err)
	}
	progress = &serviceJobProgress{service: service, jobID: job.ID}
	if err := handler.Reacquire(t.Context(), retry, progress); err != nil {
		t.Fatal(err)
	}
	if len(deleted) != 2 || files[142].ArrFileID != 142 || files[44].ArrFileID != 44 {
		t.Fatal("retry deleted replacement or another season")
	}
	files[143] = arr.LibraryFile{ArrFileID: 143, SeriesID: 7, SeasonNumber: 2, Path: "/tv/S02/new-two.mkv", EpisodeIDs: []int{42}}
	if ready, err := service.jobImported(t.Context(), retry); err != nil || !ready {
		t.Fatalf("complete season not confirmed: %v %v", ready, err)
	}
	// No index shortcut may certify a whole season using stale file bindings.
	if _, ready := service.replacementsForJob(retry); ready {
		t.Fatal("index bypassed authoritative season import check")
	}
}

func TestSeasonSnapshotRejectsScopeChanges(t *testing.T) {
	configureArrHTTPTest(t)
	_, instance := seasonTestHandler("http://unused.test")
	b := Binding{ArrName: instance.Name, ArrType: arr.Sonarr, ArrInstanceFingerprint: instance.Fingerprint(), EntryID: "original", EntryFileID: "42", ArrFileID: 42, LibraryPath: "/tv/one.mkv", SeriesID: 7, SeasonNumber: 2, EpisodeIDs: []int{41}, Confidence: ConfidenceLibraryFile}
	job := Job{ArrName: instance.Name, ArrType: arr.Sonarr, EntryID: b.EntryID, FileID: b.EntryFileID, Cause: CauseRepair, Strategy: StrategySeasonPackFirst, Bindings: []Binding{b}}
	for _, change := range []func(*Binding){func(b *Binding) { b.SeasonNumber = 3 }, func(b *Binding) { b.SeriesID = 8 }, func(b *Binding) { b.ArrInstanceFingerprint = "different" }, func(b *Binding) { b.LibraryPath = "" }} {
		bad := cloneBinding(b)
		bad.ArrFileID = 43
		change(&bad)
		if err := validateSeasonSnapshot(job, []Binding{b, bad}); !errors.Is(err, ErrBindingUnsafe) {
			t.Fatalf("unsafe scope accepted: %+v", bad)
		}
	}
}

type failedSeasonProgress struct{ recordedProgress }

func (*failedSeasonProgress) UpdateDurable(Status, func(*Job)) error {
	return errors.New("storage unavailable")
}

func TestWholeSeasonDoesNotDeleteWithoutDurableSnapshot(t *testing.T) {
	configureArrHTTPTest(t)
	if _, err := config.Update(func(c *config.Config) error { c.Repair.ReplaceWholeSeason = true; return nil }); err != nil {
		t.Fatal(err)
	}
	deletes := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			deletes++
			t.Error("delete after failed persistence")
			return
		}
		switch r.URL.Path {
		case "/api/v3/config/downloadclient":
			fmt.Fprint(w, `{"enableCompletedDownloadHandling":true}`)
		case "/api/v3/episodefile":
			fmt.Fprint(w, `[{"id":42,"seriesId":7,"seasonNumber":2,"path":"/tv/one.mkv"}]`)
		case "/api/v3/episode":
			fmt.Fprint(w, `[{"id":41,"episodeFileId":42}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	handler, instance := seasonTestHandler(server.URL)
	b := Binding{ArrName: instance.Name, ArrType: arr.Sonarr, ArrInstanceFingerprint: instance.Fingerprint(), EntryID: "original", EntryFileID: "42", ArrFileID: 42, LibraryPath: "/tv/one.mkv", SeriesID: 7, SeasonNumber: 2, EpisodeIDs: []int{41}, Confidence: ConfidenceLibraryFile}
	job := Job{ArrName: instance.Name, ArrType: arr.Sonarr, EntryID: b.EntryID, FileID: b.EntryFileID, Cause: CauseRepair, Strategy: StrategySeasonPackFirst, Bindings: []Binding{b}}
	err := handler.Reacquire(t.Context(), job, &failedSeasonProgress{})
	if err == nil || !strings.Contains(err.Error(), "storage unavailable") || deletes != 0 {
		t.Fatalf("unsafe failure: deletes=%d err=%v", deletes, err)
	}
}
