package repair

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
	"github.com/sirrobot01/decypharr/pkg/storage"
)

func TestScheduledFullAuditRechecksRecentlyHealthyFiles(t *testing.T) {
	store := newRepairTestStorage(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "movie.mkv")
	writeLibrarySample(t, path)
	if err := os.WriteFile(filepath.Join(dir, "version.txt"), []byte("mounted"), 0600); err != nil {
		t.Fatal(err)
	}
	old := config.Get()
	t.Cleanup(func() {
		_, _ = config.Update(func(c *config.Config) error { c.Repair = old.Repair; c.Mount = old.Mount; return nil })
	})
	if _, err := config.Update(func(c *config.Config) error {
		c.Repair = config.RepairConfig{Enabled: true, Source: config.RepairSourceArr, LibraryAudit: true, ScheduledFullAudit: true, RecheckInterval: "168h"}
		c.Mount.MountPath = dir
		c.Mount.Type = "dfs"
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/v3/movie" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]any{{"id": 9, "movieFile": map[string]any{"id": 42, "movieId": 9, "path": path, "size": 1000000}}})
	}))
	defer server.Close()
	registry := arr.New()
	registry.AddOrUpdate(arr.Arr{Name: "movies", Host: server.URL, Token: "test", Type: arr.Radarr})
	service := New(Dependencies{Storage: store, Arrs: registry})
	run := func(trigger storage.RepairRunTrigger, opts RunOptions, want int) {
		t.Helper()
		id, err := service.runSweep(trigger, opts)
		if err != nil {
			t.Fatal(err)
		}
		service.runWG.Wait()
		result, err := store.GetRepairRun(id)
		if err != nil || result.Status != storage.RepairRunCompleted || result.Stats.Probed != want {
			t.Fatalf("run %+v err=%v want probes %d", result, err, want)
		}
	}
	run(storage.RepairTriggerManual, RunOptions{IgnoreLastChecked: true}, 1)
	run(storage.RepairTriggerManual, RunOptions{}, 0)
	run(storage.RepairTriggerScheduled, RunOptions{}, 1)
	if _, err := config.Update(func(c *config.Config) error { c.Repair.ScheduledFullAudit = false; return nil }); err != nil {
		t.Fatal(err)
	}
	run(storage.RepairTriggerScheduled, RunOptions{}, 0)
}
