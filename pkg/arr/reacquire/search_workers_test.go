package reacquire

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
)

type blockingSearchHandler struct {
	started chan string
	release chan struct{}
}

func (h *blockingSearchHandler) Reacquire(ctx context.Context, j Job, p JobProgress) error {
	select {
	case h.started <- j.ID:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case <-h.release:
		return p.Update(StatusWaitingForDownload, nil)
	case <-ctx.Done():
		return ctx.Err()
	}
}
func configureSearchWorkers(t *testing.T, workers, active int) {
	t.Helper()
	configureArrHTTPTest(t)
	_, err := config.Update(func(c *config.Config) error {
		c.Repair.QueueInterval = "1ms"
		c.Repair.QueueBatchSize = 100
		c.Repair.QueueBatchPause = "0s"
		c.Repair.QueueMaxActive = active
		c.Repair.QueueSearchWorkers = workers
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
func receiveSearch(t *testing.T, h *blockingSearchHandler) string {
	t.Helper()
	select {
	case id := <-h.started:
		return id
	case <-time.After(2 * time.Second):
		t.Fatal("search worker did not start")
		return ""
	}
}
func TestSearchWorkersOverlapAndRespectCapacity(t *testing.T) {
	configureSearchWorkers(t, 3, 4)
	s, err := NewService(ServiceOptions{Directory: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	var clock atomic.Int64
	clock.Store(time.Now().UnixNano())
	s.now = func() time.Time { return time.Unix(0, clock.Load()) }
	if err = s.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for id := 1; id <= 5; id++ {
		queuedRepairForTest(t, s, id, CauseRepair)
	}
	h := &blockingSearchHandler{started: make(chan string, 10), release: make(chan struct{}, 10)}
	s.SetHandler(h)
	ids := map[string]bool{}
	for i := 0; i < 3; i++ {
		id := receiveSearch(t, h)
		if ids[id] {
			t.Fatal("duplicate dispatch")
		}
		ids[id] = true
		clock.Add(int64(time.Second))
		s.signal()
	}
	select {
	case <-h.started:
		t.Fatal("more than three concurrent searches")
	case <-time.After(40 * time.Millisecond):
	}
	q := s.RepairQueueStatus()
	if q.Searching != 3 || q.InFlight != 3 {
		t.Fatalf("worker/capacity accounting: %+v", q)
	}
	h.release <- struct{}{}
	id := receiveSearch(t, h)
	if ids[id] {
		t.Fatal("duplicate after worker release")
	}
	ids[id] = true
	clock.Add(int64(time.Second))
	h.release <- struct{}{}
	h.release <- struct{}{}
	h.release <- struct{}{}
	select {
	case <-h.started:
		t.Fatal("exceeded four in-flight downloads/imports")
	case <-time.After(60 * time.Millisecond):
	}
	// Close must cancel and join workers rather than hang on blocked searches.
}

func TestSearchWorkersClaimSeasonBeforePreflightAndKeepGlobalPacing(t *testing.T) {
	configureSearchWorkers(t, 3, 20)
	s, err := NewService(ServiceOptions{Directory: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	var clock atomic.Int64
	clock.Store(time.Now().UnixNano())
	s.now = func() time.Time { return time.Unix(0, clock.Load()) }
	if err = s.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for id := 1; id <= 3; id++ {
		season := 1
		if id == 3 {
			season = 2
		}
		b := Binding{ArrName: "shows", ArrType: arr.Sonarr, ArrInstanceFingerprint: testArrInstanceFingerprint, EntryID: fmt.Sprint("entry", id), EntryFileID: "1", ArrFileID: id, LibraryPath: fmt.Sprintf("/show/S%dE%d.mkv", season, id), SeriesID: 7, SeasonNumber: season, EpisodeIDs: []int{id}, Confidence: ConfidenceExactPath}
		if err = s.UpsertBinding(b); err != nil {
			t.Fatal(err)
		}
		if _, err = s.Reacquire(Request{EntryID: b.EntryID, FileID: b.EntryFileID, Cause: CauseRepair}); err != nil {
			t.Fatal(err)
		}
	}
	h := &blockingSearchHandler{started: make(chan string, 10), release: make(chan struct{}, 10)}
	s.SetHandler(h)
	first := receiveSearch(t, h)
	s.signal()
	select {
	case <-h.started:
		t.Fatal("ignored global interval")
	case <-time.After(40 * time.Millisecond):
	}
	clock.Add(int64(time.Second))
	s.signal()
	second := receiveSearch(t, h)
	a, _ := s.Job(first)
	b, _ := s.Job(second)
	if a.Bindings[0].SeasonNumber == b.Bindings[0].SeasonNumber {
		t.Fatal("concurrent searches in same season")
	}
	clock.Add(int64(time.Second))
	s.signal()
	select {
	case <-h.started:
		t.Fatal("third worker ignored season guard")
	case <-time.After(40 * time.Millisecond):
	}
	h.release <- struct{}{}
	h.release <- struct{}{}
	select {
	case <-h.started:
		t.Fatal("season guard released before import")
	case <-time.After(40 * time.Millisecond):
	}
}

type rateLimitedSearchHandler struct{ until time.Time }

func (h rateLimitedSearchHandler) Reacquire(ctx context.Context, j Job, p JobProgress) error {
	return &arr.SearchRateLimitError{ArrName: j.ArrName, RetryAt: h.until}
}
func TestRateLimitedSearchPersistsDelayWithoutUsingSearchRetryBudget(t *testing.T) {
	s, j, _ := recoveryFixture(t, "http://arr.invalid")
	until := s.now().Add(15 * time.Minute)
	handler := rateLimitedSearchHandler{until: until}
	if !s.runJob(t.Context(), handler, j) {
		t.Fatal("did not schedule rate-limited search")
	}
	current, _ := s.Job(j.ID)
	if current.Status != StatusRetryScheduled || current.RetryReason != "rate_limited" || current.RetryAt.Before(until) || current.RetryCount != 0 {
		t.Fatalf("429 state: %+v", current)
	}
	if !s.runJob(t.Context(), handler, current) {
		t.Fatal("second rate limit failed")
	}
	current, _ = s.Job(j.ID)
	if current.RetryCount != 0 || len(current.Attempts) != 1 || current.Attempts[0].Outcome != "rate_limited" {
		t.Fatalf("429 consumed normal retry budget: %+v", current)
	}
}
