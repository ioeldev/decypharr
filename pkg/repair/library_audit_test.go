package repair

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
	"github.com/sirrobot01/decypharr/pkg/arr/reacquire"
	"github.com/sirrobot01/decypharr/pkg/storage"
)

func writeLibrarySample(t *testing.T, path string) {
	t.Helper()
	data := make([]byte, librarySampleBytes)
	copy(data, []byte{0x1a, 0x45, 0xdf, 0xa3})
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
}

func TestLibraryReadThroughSymlink(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "remote.mkv")
	link := filepath.Join(dir, "movie.mkv")
	writeLibrarySample(t, target)
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	if result := libraryRead(link); result.status != storage.HealthHealthy {
		t.Fatalf("readable target: %+v", result)
	}
	if err := os.Remove(target); err != nil {
		t.Fatal(err)
	}
	if result := libraryRead(link); result.status != storage.HealthBroken || result.reason != "library_target_missing" {
		t.Fatalf("missing target: %+v", result)
	}
	if result := libraryRead(filepath.Join(dir, "unmounted", "movie.mkv")); result.status != storage.HealthUnknown {
		t.Fatalf("unavailable library directory must not be repairable: %+v", result)
	}
}

func TestLibraryReadRejectsTruncatedOrErrorContent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "movie.mkv")
	if err := os.WriteFile(path, []byte("short"), 0600); err != nil {
		t.Fatal(err)
	}
	if result := libraryRead(path); result.status != storage.HealthBroken || result.reason != "library_file_too_small" {
		t.Fatalf("small file: %+v", result)
	}
	data := make([]byte, librarySampleBytes)
	copy(data, []byte("<html>Provider error</html>"))
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if result := libraryRead(path); result.status != storage.HealthBroken || result.reason != "library_error_document" {
		t.Fatalf("error body: %+v", result)
	}
}

func TestLibraryTimeoutDoesNotAccumulateBlockedWorkers(t *testing.T) {
	setLibraryWorkers(t, 1)
	service := New(Dependencies{})
	release := make(chan struct{})
	started := make(chan struct{})
	var calls atomic.Int32
	result := service.boundedLibraryIO(t.Context(), 20*time.Millisecond, func() libraryProbeResult {
		calls.Add(1)
		close(started)
		<-release
		return libraryProbeResult{status: storage.HealthHealthy}
	})
	<-started
	if result.status != storage.HealthUnknown || result.reason != "library_read_timeout" {
		t.Fatalf("timeout: %+v", result)
	}
	next := service.boundedLibraryIO(t.Context(), 20*time.Millisecond, func() libraryProbeResult { calls.Add(1); return libraryProbeResult{} })
	if next.reason != "library_io_busy" || calls.Load() != 1 {
		t.Fatalf("blocked probe spawned another worker: %+v, calls=%d", next, calls.Load())
	}
	close(release)
	deadline := time.Now().Add(time.Second)
	for libraryProbeCount(service) > 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if result := service.boundedLibraryIO(t.Context(), time.Second, func() libraryProbeResult { return libraryProbeResult{status: storage.HealthHealthy} }); result.status != storage.HealthHealthy {
		t.Fatalf("slot did not recover: %+v", result)
	}
}

func TestLibraryOrphanPersistsAndUsesArrIdentity(t *testing.T) {
	store := newRepairTestStorage(t)
	service := New(Dependencies{Storage: store})
	path := filepath.Join(t.TempDir(), "Keeper.mkv")
	if err := os.Symlink(filepath.Join(t.TempDir(), "missing.mkv"), path); err != nil {
		t.Fatal(err)
	}
	health := &storage.EntryHealth{EntryName: "library:keeper", DisplayName: "Keeper", LibraryFile: &storage.BrokenFile{
		LibraryAudit: true, ArrName: "movies", ArrKind: storage.ArrKindRadarr, ArrFileID: 42, SourcePath: path, FileName: "Keeper.mkv",
	}}
	result := service.auditOneLibraryFile(t.Context(), health)
	if result.status != storage.HealthBroken {
		t.Fatalf("orphan result: %+v", result)
	}
	persisted, err := store.GetEntryHealth(health.EntryName)
	if err != nil || len(persisted.BrokenFiles) != 1 || persisted.BrokenFiles[0].InfoHash != "" {
		t.Fatalf("orphan state: %+v, %v", persisted, err)
	}
	broken, _ := service.collectBrokenHealths([]string{health.EntryName}, true)
	if broken.Size() != 1 {
		t.Fatal("orphan missing from Fix broken candidates")
	}
	fake := &fakeReacquirer{library: func(request reacquire.LibraryRequest) (*reacquire.Job, error) {
		if request.ArrName != "movies" || request.ArrFileID != 42 || request.LibraryPath != path {
			t.Fatalf("incorrect identity: %+v", request)
		}
		return &reacquire.Job{ID: "library-job"}, nil
	}}
	service.reacquirer = fake
	job, err := service.reacquireBrokenFile(t.Context(), persisted.BrokenFiles[0])
	if err != nil || job.ID != "library-job" || len(fake.requests) != 0 {
		t.Fatalf("library recovery: %+v, %v", job, err)
	}
	// A recovered path gets a fresh result; an API sweep cannot overwrite this key.
	target, _ := os.Readlink(path)
	writeLibrarySample(t, target)
	service.auditOneLibraryFile(t.Context(), health)
	persisted, _ = store.GetEntryHealth(health.EntryName)
	if persisted.Status != storage.HealthHealthy || len(persisted.BrokenFiles) != 0 {
		t.Fatalf("recovered state: %+v", persisted)
	}
}

func TestLibraryRepairVerifiesOriginalReinsertion(t *testing.T) {
	store := newRepairTestStorage(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "film.mkv")
	target := filepath.Join(dir, "target.mkv")
	if err := os.Symlink(target, path); err != nil {
		t.Fatal(err)
	}
	// Use an isolated, available mount path; no live provider/config is touched.
	old := config.Get().Mount
	t.Cleanup(func() { _, _ = config.Update(func(c *config.Config) error { c.Mount = old; return nil }) })
	_, err := config.Update(func(c *config.Config) error { c.Mount.MountPath = dir; c.Mount.Type = "dfs"; return nil })
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "version.txt"), []byte("test"), 0600); err != nil {
		t.Fatal(err)
	}
	entry := &storage.Entry{InfoHash: "original", Name: "release", Protocol: config.ProtocolTorrent, Files: map[string]*storage.File{}}
	if err := store.AddOrUpdate(entry); err != nil {
		t.Fatal(err)
	}
	attempts := 0
	backend := &removedProviderBackend{reinsert: func(*storage.Entry) error { attempts++; return nil }}
	service := New(Dependencies{Storage: store, Backend: backend})
	broken := storage.BrokenFile{LibraryAudit: true, InfoHash: "original", SourcePath: path}
	restored, err := service.restoreLibraryFile(t.Context(), broken)
	if err != nil || restored || attempts != 1 {
		t.Fatalf("provider success falsely accepted: restored=%v attempts=%d err=%v", restored, attempts, err)
	}
	backend.reinsert = func(*storage.Entry) error { writeLibrarySample(t, target); return nil }
	restored, err = service.restoreLibraryFile(t.Context(), broken)
	if err != nil || !restored {
		t.Fatalf("restored path not accepted: %v %v", restored, err)
	}
	// A previously broken but now readable path must not queue a replacement.
	fake := &fakeReacquirer{library: func(reacquire.LibraryRequest) (*reacquire.Job, error) { return nil, errors.New("must not run") }}
	service.reacquirer = fake
	h := &storage.EntryHealth{EntryName: "library:restored", Status: storage.HealthBroken, BrokenFiles: []storage.BrokenFile{{LibraryAudit: true, ArrName: "movies", ArrKind: storage.ArrKindRadarr, SourcePath: path}}}
	var mu sync.Mutex
	run := &storage.RepairRun{ID: "repair"}
	service.healBrokenEntry(context.Background(), run, &mu, h)
	if run.Stats.Restored != 1 || run.Stats.Queued != 0 || run.Stats.Repaired != 1 {
		t.Fatalf("readable path counted as queued: %+v", run.Stats)
	}
	if h.Status != storage.HealthHealthy || len(fake.libraryRequests) != 0 {
		t.Fatalf("readable path repaired destructively: %+v", h)
	}
}

func TestLibraryAuditRetainsRemovedIncidents(t *testing.T) {
	store := newRepairTestStorage(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "Keeper.mkv")
	if err := os.Symlink(filepath.Join(dir, "absent.mkv"), path); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "version.txt"), []byte("test mount"), 0600); err != nil {
		t.Fatal(err)
	}
	old := config.Get()
	t.Cleanup(func() {
		_, _ = config.Update(func(c *config.Config) error { c.Repair = old.Repair; c.Mount = old.Mount; return nil })
	})
	_, err := config.Update(func(c *config.Config) error {
		c.Repair = config.RepairConfig{LibraryAudit: true}
		c.Mount.MountPath = dir
		c.Mount.Type = "dfs"
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	var removed atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("detection-only audit mutated Arr: %s", r.Method)
		}
		if r.URL.Path != "/api/v3/movie" {
			http.NotFound(w, r)
			return
		}
		if removed.Load() {
			fmt.Fprint(w, `[]`)
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]any{{"id": 9, "movieFile": map[string]any{"id": 42, "movieId": 9, "path": path, "size": 1000000}}})
	}))
	defer server.Close()
	registry := arr.New()
	instance := arr.Arr{Name: "movies", Host: server.URL, Token: "test", Type: arr.Radarr}
	registry.AddOrUpdate(instance)
	service := New(Dependencies{Storage: store, Arrs: registry})
	if err := store.SaveEntryHealth(&storage.EntryHealth{EntryName: "Provider.API.Healthy", Status: storage.HealthHealthy}); err != nil {
		t.Fatal(err)
	}
	// RunNow inherits the new scheduled/default mode, without an explicit option.
	id, err := service.RunNow(RunOptions{AutoRepair: new(false), IgnoreLastChecked: true})
	if err != nil {
		t.Fatal(err)
	}
	service.runWG.Wait()
	run, err := store.GetRepairRun(id)
	if err != nil || run.Status != storage.RepairRunCompleted || run.Stats.Broken != 1 || run.Stats.Probed != 1 {
		t.Fatalf("orphan run: %+v, %v", run, err)
	}
	health, err := store.GetEntryHealth(libraryKey(instance, 42))
	if err != nil || health.Status != storage.HealthBroken || len(health.BrokenFiles) != 1 || health.BrokenFiles[0].ArrFileID != 42 {
		t.Fatalf("orphan finding: %+v, %v", health, err)
	}
	provider, _ := store.GetEntryHealth("Provider.API.Healthy")
	if provider.Status != storage.HealthHealthy {
		t.Fatal("audit overwrote provider result")
	}
	removed.Store(true)
	if _, err := service.collectLibraryAuditFiles(t.Context(), RunOptions{IgnoreLastChecked: true}); err != nil {
		t.Fatal(err)
	}
	retained, err := store.GetEntryHealth(health.EntryName)
	if err != nil || !retained.LibraryRemoved || retained.Status != storage.HealthUnknown || len(retained.BrokenFiles) != 0 || retained.LastFailedAt.IsZero() {
		t.Fatalf("removed incident lost history or stayed actionable: %+v %v", retained, err)
	}
}

func TestLibraryAuditCancellationIsNotReportedAsSuccess(t *testing.T) {
	store := newRepairTestStorage(t)
	service := New(Dependencies{Storage: store})
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	run := &storage.RepairRun{ID: "cancelled-audit"}
	service.executeLibraryAudit(ctx, run, RunOptions{AutoRepair: new(false)}, nil)
	saved, err := store.GetRepairRun(run.ID)
	if err != nil || saved.Status != storage.RepairRunCancelled {
		t.Fatalf("cancelled run: %+v %v", saved, err)
	}
}

func setLibraryWorkers(t *testing.T, workers int) {
	t.Helper()
	old := config.Get().Repair
	t.Cleanup(func() { _, _ = config.Update(func(c *config.Config) error { c.Repair = old; return nil }) })
	if _, err := config.Update(func(c *config.Config) error { c.Repair.Workers = workers; return nil }); err != nil {
		t.Fatal(err)
	}
}

func libraryProbeCount(service *Service) int {
	service.libraryProbeMu.Lock()
	defer service.libraryProbeMu.Unlock()
	return service.libraryProbeActive
}

func TestLibraryConcurrentProbesRetainSlotsAfterCancellation(t *testing.T) {
	setLibraryWorkers(t, 3)
	service := New(Dependencies{})
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	release := make(chan struct{})
	defer close(release)
	started := make(chan struct{}, 3)
	results := make(chan libraryProbeResult, 3)
	for range 3 {
		go func() {
			results <- service.boundedLibraryIO(ctx, time.Second, func() libraryProbeResult {
				started <- struct{}{}
				<-release
				return libraryProbeResult{status: storage.HealthHealthy}
			})
		}()
	}
	for range 3 {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatal("configured workers did not probe concurrently")
		}
	}
	cancel()
	for range 3 {
		select {
		case result := <-results:
			if result.status != storage.HealthUnknown {
				t.Fatalf("cancelled probe: %+v", result)
			}
		case <-time.After(time.Second):
			t.Fatal("cancellation waited for blocked filesystem call")
		}
	}
	if active := libraryProbeCount(service); active != 3 {
		t.Fatalf("blocked slots = %d, want 3", active)
	}
	// A subsequent run cannot replace workers still stuck in the old run.
	var called atomic.Bool
	result := service.boundedLibraryIO(t.Context(), 20*time.Millisecond, func() libraryProbeResult {
		called.Store(true)
		return libraryProbeResult{status: storage.HealthHealthy}
	})
	if called.Load() || result.reason != "library_io_busy" {
		t.Fatalf("exceeded worker budget: %+v", result)
	}
	// Lowering the configured concurrency also keeps those slots accounted for.
	if _, err := config.Update(func(c *config.Config) error { c.Repair.Workers = 1; return nil }); err != nil {
		t.Fatal(err)
	}
	result = service.boundedLibraryIO(t.Context(), 20*time.Millisecond, func() libraryProbeResult {
		called.Store(true)
		return libraryProbeResult{status: storage.HealthHealthy}
	})
	if called.Load() || result.reason != "library_io_busy" {
		t.Fatalf("config update lost occupied slots: %+v", result)
	}
}

func TestLibraryAuditConcurrentCountsAndDuplicateSelection(t *testing.T) {
	setLibraryWorkers(t, 4)
	store := newRepairTestStorage(t)
	fake := &fakeReacquirer{library: func(reacquire.LibraryRequest) (*reacquire.Job, error) {
		return &reacquire.Job{ID: "queued"}, nil
	}}
	service := New(Dependencies{Storage: store, Reacquirer: fake})
	dir := t.TempDir()
	old := config.Get().Mount
	t.Cleanup(func() { _, _ = config.Update(func(c *config.Config) error { c.Mount = old; return nil }) })
	if _, err := config.Update(func(c *config.Config) error { c.Mount.MountPath = dir; c.Mount.Type = "dfs"; return nil }); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "version.txt"), []byte("test"), 0600); err != nil {
		t.Fatal(err)
	}
	var keys []string
	for i := range 48 {
		key := fmt.Sprintf("library:%d", i)
		path := filepath.Join(dir, fmt.Sprintf("%d.mkv", i))
		switch i % 3 {
		case 0:
			writeLibrarySample(t, path)
		case 1:
			if err := os.Symlink(filepath.Join(dir, "missing.mkv"), path); err != nil {
				t.Fatal(err)
			}
		case 2:
			path = filepath.Join(dir, "unmounted", fmt.Sprintf("%d.mkv", i))
		}
		if err := store.SaveEntryHealth(&storage.EntryHealth{EntryName: key, LibraryFile: &storage.BrokenFile{LibraryAudit: true, ArrName: "movies", ArrKind: storage.ArrKindRadarr, SourcePath: path}}); err != nil {
			t.Fatal(err)
		}
		keys = append(keys, key, key)
	}
	for _, autoRepair := range []bool{false, true} {
		run := &storage.RepairRun{ID: fmt.Sprintf("concurrent-audit-%v", autoRepair)}
		service.executeLibraryAudit(t.Context(), run, RunOptions{LibraryEntries: keys, AutoRepair: &autoRepair}, nil)
		saved, err := store.GetRepairRun(run.ID)
		if err != nil {
			t.Fatal(err)
		}
		wantQueued := 0
		if autoRepair {
			wantQueued = 16
		}
		if saved.Status != storage.RepairRunCompleted || saved.Stats.Candidates != 48 || saved.Stats.Probed != 48 || saved.Stats.Healthy != 16 || saved.Stats.Broken != 16 || saved.Stats.Unknown != 16 || saved.Stats.Queued != wantQueued {
			t.Fatalf("concurrent audit totals: %+v", saved)
		}
		if len(fake.libraryRequests) != wantQueued {
			t.Fatalf("recovery submissions = %d, want %d", len(fake.libraryRequests), wantQueued)
		}
	}
}

func TestLibraryIncidentSurvivesReplacementAndConcurrentPause(t *testing.T) {
	store := newRepairTestStorage(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "new.mkv")
	writeLibrarySample(t, path)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Error("audit mutated Arr")
		}
		file := map[string]any{"id": 43, "movieId": 9, "path": path}
		movie := map[string]any{"id": 9, "movieFile": file}
		if r.URL.Path == "/api/v3/movie/9" {
			_ = json.NewEncoder(w).Encode(movie)
		} else {
			_ = json.NewEncoder(w).Encode([]any{movie})
		}
	}))
	defer server.Close()
	registry := arr.New()
	instance := arr.Arr{Name: "movies", Host: server.URL, Token: "test", Type: arr.Radarr}
	registry.AddOrUpdate(instance)
	service := New(Dependencies{Storage: store, Arrs: registry})
	h := &storage.EntryHealth{EntryName: libraryKey(instance, 42), Status: storage.HealthBroken, LastFailedAt: time.Now().Add(-time.Hour), LibraryFile: &storage.BrokenFile{LibraryAudit: true, ArrName: instance.Name, ArrFingerprint: instance.Fingerprint(), ArrKind: storage.ArrKindRadarr, MediaID: 9, ArrFileID: 42, SourcePath: "/old.mkv"}}
	if err := store.SaveEntryHealth(h); err != nil {
		t.Fatal(err)
	}
	files, err := service.collectLibraryAuditFiles(t.Context(), RunOptions{IgnoreLastChecked: true})
	if err != nil || len(files) != 1 || files[0].EntryName != h.EntryName || files[0].LibraryFile.ArrFileID != 43 {
		t.Fatalf("replacement identity: %+v %v", files, err)
	}
	// Pause after enumeration; persisting the probe must not overwrite the action.
	if err := service.PauseLibraryIncident(h.EntryName, true); err != nil {
		t.Fatal(err)
	}
	if result := service.auditOneLibraryFile(t.Context(), files[0]); result.status != storage.HealthHealthy {
		t.Fatalf("read: %+v", result)
	}
	incidents, err := service.LibraryIncidents()
	if err != nil || len(incidents) != 1 || incidents[0].Status != storage.HealthHealthy || !incidents[0].LibraryPaused || incidents[0].LastFailedAt.IsZero() {
		t.Fatalf("history/pause: %+v %v", incidents, err)
	}
	if err := service.refreshLibraryIncident(t.Context(), incidents[0]); err != nil {
		t.Fatal(err)
	}
	if incidents[0].LibraryFile.ArrFileID != 43 {
		t.Fatal("manual recheck retained old Arr ID")
	}
}
