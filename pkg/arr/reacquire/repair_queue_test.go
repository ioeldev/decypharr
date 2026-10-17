package reacquire

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
)

func configureRepairQueueTest(t *testing.T) {
	t.Helper()
	configureArrHTTPTest(t)
	if _, err := config.Update(func(c *config.Config) error {
		c.Repair.QueueInterval = "10s"
		c.Repair.QueueBatchSize = 2
		c.Repair.QueueBatchPause = "1m"
		c.Repair.QueueMaxActive = 1
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func queuedRepairForTest(t *testing.T, s *Service, id int, cause Cause) *Job {
	t.Helper()
	b := Binding{ArrName: "movies", ArrType: arr.Radarr, ArrInstanceFingerprint: testArrInstanceFingerprint, EntryID: fmt.Sprint("entry", id), EntryFileID: fmt.Sprint("file", id), ArrFileID: id, LibraryPath: fmt.Sprint("/movies/", id, ".mkv"), MovieID: id, Confidence: ConfidenceExactPath}
	if err := s.UpsertBinding(b); err != nil {
		t.Fatal(err)
	}
	job, err := s.Reacquire(Request{EntryID: b.EntryID, FileID: b.EntryFileID, Cause: cause})
	if err != nil {
		t.Fatal(err)
	}
	return job
}

func TestRepairQueueRateCapacityBatchAndRestart(t *testing.T) {
	configureRepairQueueTest(t)
	var clock atomic.Int64
	clock.Store(time.Now().UnixNano())
	now := func() time.Time { return time.Unix(0, clock.Load()) }
	directory := t.TempDir()
	service, err := NewService(ServiceOptions{Directory: directory})
	if err != nil {
		t.Fatal(err)
	}
	service.now = now
	if err := service.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = service.Close() })
	first := queuedRepairForTest(t, service, 1, CauseRepair)
	clock.Add(int64(time.Millisecond))
	second := queuedRepairForTest(t, service, 2, CauseRepair)
	clock.Add(int64(time.Millisecond))
	third := queuedRepairForTest(t, service, 3, CauseRepair)
	if next, ok := service.nextJob(); !ok || next.ID != first.ID {
		t.Fatal("oldest queued repair did not get first slot")
	}
	if err := service.reserveRepairDispatch(*first); err != nil {
		t.Fatal(err)
	}
	if _, ok := service.nextJob(); ok {
		t.Fatal("minimum interval was bypassed")
	}
	if _, err := service.updateJobDurable(first.ID, StatusWaitingForImport, nil); err != nil {
		t.Fatal(err)
	}
	clock.Add(int64(20 * time.Second))
	if _, ok := service.nextJob(); ok {
		t.Fatal("capacity limit ignored a pending import")
	}
	if _, err := service.updateJobDurable(first.ID, StatusReady, nil); err != nil {
		t.Fatal(err)
	}
	if next, ok := service.nextJob(); !ok || next.ID != second.ID {
		t.Fatal("queue did not resume when capacity freed")
	}
	if err := service.reserveRepairDispatch(*second); err != nil {
		t.Fatal(err)
	}
	if _, err := service.updateJobDurable(second.ID, StatusReady, nil); err != nil {
		t.Fatal(err)
	}
	if status := service.RepairQueueStatus(); status.InBatch != 0 || status.Queued != 1 || !status.NextAllowedAt.Equal(now().Add(time.Minute)) {
		t.Fatalf("batch status: %+v", status)
	}
	if _, err := service.DeleteJobs([]string{first.ID, second.ID}); err != nil {
		t.Fatal(err)
	}
	if err := service.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := NewService(ServiceOptions{Directory: directory})
	if err != nil {
		t.Fatal(err)
	}
	reopened.now = now
	if err := reopened.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	if _, ok := reopened.nextJob(); ok {
		t.Fatal("restart or history cleanup erased batch cooldown")
	}
	clock.Add(int64(time.Minute))
	if next, ok := reopened.nextJob(); !ok || next.ID != third.ID {
		t.Fatal("pending repair did not survive restart")
	}
	if _, err := config.Update(func(c *config.Config) error { c.Repair.QueuePaused = true; return nil }); err != nil {
		t.Fatal(err)
	}
	if _, ok := reopened.nextJob(); ok {
		t.Fatal("paused queue dispatched a fresh repair")
	}
	manual := queuedRepairForTest(t, reopened, 4, CauseManual)
	if next, ok := reopened.nextJob(); !ok || next.ID != manual.ID {
		t.Fatal("paused repairs blocked an explicit manual job")
	}
	if _, err := reopened.updateJobDurable(third.ID, StatusResolving, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := reopened.updateJobDurable(third.ID, StatusQueued, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := reopened.updateJobDurable(manual.ID, StatusReady, nil); err != nil {
		t.Fatal(err)
	}
	if next, ok := reopened.nextJob(); !ok || next.ID != third.ID {
		t.Fatal("pause blocked reconciliation of an already started repair")
	}
}

func TestRepairQueuePersistFailurePreventsArrWork(t *testing.T) {
	configureRepairQueueTest(t)
	handler := &waitingReacquireHandler{called: make(chan string, 1)}
	service, err := NewService(ServiceOptions{Directory: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = service.Close() })
	job := queuedRepairForTest(t, service, 1, CauseRepair)
	// Set the state path before enabling the worker; its parent does not exist.
	service.repairQueuePath = filepath.Join(t.TempDir(), "missing", "state.json")
	if err := service.SetHandler(handler); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for service.RepairQueueStatus().Error == "" && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	select {
	case <-handler.called:
		t.Fatal("Arr handler ran without a durable queue reservation")
	default:
	}
	current, _ := service.Job(job.ID)
	if current.Status != StatusQueued || !current.StartedAt.IsZero() || service.RepairQueueStatus().Error == "" {
		t.Fatalf("save failure did not leave a visible queued job: %+v", current)
	}
}

func TestQueuedOrphanAlreadyReplacedSkipsAnotherSearch(t *testing.T) {
	configureArrHTTPTest(t)
	var imported atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("replacement check mutated Arr: %s", r.Method)
		}
		switch r.URL.Path {
		case "/api/v3/episodefile/42":
			if imported.Load() {
				http.NotFound(w, r)
				return
			}
			fmt.Fprint(w, `{"id":42,"seriesId":7,"seasonNumber":2,"path":"/tv/episode.mkv"}`)
		case "/api/v3/episodefile":
			fmt.Fprint(w, `[{"id":43,"seriesId":7,"seasonNumber":2,"path":"/tv/replacement.mkv"}]`)
		case "/api/v3/episode":
			if imported.Load() {
				fmt.Fprint(w, `[{"id":41,"episodeFileId":43}]`)
			} else {
				fmt.Fprint(w, `[{"id":41,"episodeFileId":42}]`)
			}
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
	if err := service.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = service.Close() })
	job, err := service.ReacquireLibraryFile(t.Context(), LibraryRequest{ArrName: "shows", ArrFileID: 42, LibraryPath: "/tv/episode.mkv", Cause: CauseRepair})
	if err != nil {
		t.Fatal(err)
	}
	if covered, err := service.completeQueuedLibraryJob(t.Context(), *job); covered || err != nil {
		t.Fatalf("original file mistaken for a replacement: %v %v", covered, err)
	}
	imported.Store(true)
	if covered, err := service.completeQueuedLibraryJob(t.Context(), *job); !covered || err != nil {
		t.Fatalf("imported replacement did not satisfy queued orphan: %v %v", covered, err)
	}
	current, _ := service.Job(job.ID)
	if current.Status != StatusReady || len(current.Mutations) != 0 {
		t.Fatalf("already covered episode caused another recovery: %+v", current)
	}
}

func TestRepairQueueProgressIncludesOnlyRetainedRepairJobs(t *testing.T) {
	configureRepairQueueTest(t)
	service, err := NewService(ServiceOptions{Directory: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = service.Close() })
	statuses := []Status{StatusQueued, StatusSearching, StatusWaitingForGrab, StatusWaitingForDownload, StatusWaitingForImport, StatusNeedsAttention, StatusReady, StatusFailed, StatusCancelled}
	var readyID string
	for i, status := range statuses {
		job := queuedRepairForTest(t, service, i+1, CauseRepair)
		if status != StatusQueued {
			if _, err := service.updateJobDurable(job.ID, status, nil); err != nil {
				t.Fatal(err)
			}
		}
		if status == StatusReady {
			readyID = job.ID
		}
	}
	manual := queuedRepairForTest(t, service, 100, CauseManual)
	if _, err := service.updateJobDurable(manual.ID, StatusReady, nil); err != nil {
		t.Fatal(err)
	}
	progress := service.RepairQueueStatus()
	if progress.Total != len(statuses) || progress.Queued != 1 || progress.InFlight != 4 {
		t.Fatalf("progress mixes pending, terminal, or manual jobs: %+v", progress)
	}
	for _, status := range statuses {
		if progress.StatusCounts[status] != 1 {
			t.Fatalf("%s count = %d", status, progress.StatusCounts[status])
		}
	}
	if _, err := service.DeleteJobs([]string{readyID}); err != nil {
		t.Fatal(err)
	}
	progress = service.RepairQueueStatus()
	if progress.Total != len(statuses)-1 || progress.StatusCounts[StatusReady] != 0 {
		t.Fatalf("deleted job still included in retained progress: %+v", progress)
	}
}
