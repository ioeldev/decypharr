package reacquire

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sirrobot01/decypharr/pkg/arr"
)

func recoveryFixture(t *testing.T, host string) (*Service, Job, *atomic.Int64) {
	t.Helper()
	configureRepairQueueTest(t)
	registry := arr.New()
	instance := arr.Arr{Name: "movies", Type: arr.Radarr, Host: host, Token: "test"}
	registry.AddOrUpdate(instance)
	s, err := NewService(ServiceOptions{Directory: t.TempDir(), Arrs: registry})
	if err != nil {
		t.Fatal(err)
	}
	clock := new(atomic.Int64)
	clock.Store(time.Now().UnixNano())
	s.now = func() time.Time { return time.Unix(0, clock.Load()).UTC() }
	if err := s.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	b := Binding{ArrName: "movies", ArrType: arr.Radarr, ArrInstanceFingerprint: instance.Fingerprint(), EntryID: "entry", EntryFileID: "file", ArrFileID: 42, MovieID: 9, LibraryPath: "/library/old.mkv", Confidence: ConfidenceLibraryFile}
	j, err := s.enqueueLibrary(Request{EntryID: b.EntryID, FileID: b.EntryFileID, Cause: CauseRepair, Strategy: StrategyCommandSearch}, b)
	if err != nil {
		t.Fatal(err)
	}
	started := s.now().Add(-4 * time.Minute)
	job, err := s.updateJobDurable(j.ID, StatusWaitingForGrab, func(j *Job) {
		j.StartedAt = started
		j.AttemptStartedAt = started
		j.Mutations = []Mutation{{Key: "movie_search:9", Kind: MutationMovieSearch, State: MutationConfirmed, CommandName: "MoviesSearch", MovieIDs: []int{9}, ReceiptID: 123, Attempts: 1, IntentAt: started, LastDispatchedAt: started, ConfirmedAt: started}}
	})
	if err != nil {
		t.Fatal(err)
	}
	return s, job, clock
}
func completedSearch(s *Service) recoverySnapshot {
	return recoverySnapshot{commands: []arr.Command{{ID: 123, Name: "MoviesSearch", Status: "completed", Ended: s.now().Add(-3 * time.Minute), Body: arr.CommandBody{Name: "MoviesSearch", MovieIDs: []int{9}}}}}
}
func TestCompletedSearchSchedulesDurableRetryAndFreesCapacity(t *testing.T) {
	s, j, _ := recoveryFixture(t, "http://arr.invalid")
	other := queuedRepairForTest(t, s, 88, CauseRepair)
	if _, ok := s.nextJob(); ok {
		t.Fatal("active search did not occupy slot")
	}
	if _, err := s.observeRecovery(j, completedSearch(s)); err != nil {
		t.Fatal(err)
	}
	deferred, _ := s.Job(j.ID)
	if deferred.Status != StatusRetryScheduled || deferred.RetryReason != "no_download" || !deferred.RetryAt.Equal(s.now().Add(6*time.Hour)) {
		t.Fatalf("retry: %+v", deferred)
	}
	if next, ok := s.nextJob(); !ok || next.ID != other.ID {
		t.Fatal("deferred search blocked unrelated repair")
	}
	if s.RepairQueueStatus().InFlight != 0 {
		t.Fatal("retry consumed active capacity")
	}
	directory := filepath.Dir(s.repairQueuePath)
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := NewService(ServiceOptions{Directory: directory, Arrs: s.arrs})
	if err != nil {
		t.Fatal(err)
	}
	reopened.now = s.now
	if err := reopened.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	stored, ok := reopened.Job(j.ID)
	if !ok || stored.Status != StatusRetryScheduled || !stored.RetryAt.Equal(deferred.RetryAt) || !stored.LibraryAudit {
		t.Fatal("retry lost on restart")
	}
	if next, ok := reopened.nextJob(); !ok || next.ID != other.ID {
		t.Fatal("restart dispatched deferred job early")
	}

}
func TestSearchObservationRequiresCompletionAndGrace(t *testing.T) {
	for _, name := range []string{"grace", "missing", "running", "wrong receipt", "wrong media", "unknown action", "late queue", "late history", "search failed"} {
		t.Run(name, func(t *testing.T) {
			s, j, _ := recoveryFixture(t, "http://arr.invalid")
			snap := completedSearch(s)
			want := StatusWaitingForGrab
			switch name {
			case "grace":
				snap.commands[0].Ended = s.now()
			case "missing":
				snap.commands = nil
			case "running":
				snap.commands[0].Status = "started"
			case "wrong receipt":
				snap.commands[0].ID = 999
			case "wrong media":
				snap.commands[0].Body.MovieIDs = []int{10}
			case "unknown action":
				j.Mutations[0].State = MutationIntent
				want = StatusWaitingForGrab
			case "late queue":
				snap.queue = []arr.QueueSchema{{MovieId: 9, DownloadId: "replacement", Status: "downloading", Sizeleft: 100}}
				want = StatusWaitingForDownload
			case "late history":
				snap.history = []arr.HistoryRecord{{MovieID: 9, DownloadID: "replacement", EventType: arr.EventGrabbed, Date: s.now()}}
				want = StatusWaitingForDownload
			case "search failed":
				snap.commands[0].Status = "failed"
				want = StatusRetryScheduled
			}
			if _, err := s.observeRecovery(j, snap); err != nil {
				t.Fatal(err)
			}
			got, _ := s.Job(j.ID)
			if got.Status != want {
				t.Fatalf("status=%s want %s", got.Status, want)
			}
			if name == "search failed" && got.RetryReason != "search_error" {
				t.Fatal("search error called no results")
			}
		})
	}
}
func TestObservationFailuresRotateAndDeferWithoutClaimingNoResults(t *testing.T) {
	s, j, clock := recoveryFixture(t, "http://arr.invalid")
	s.recordObservationError(j, errors.New("offline"))
	got, _ := s.Job(j.ID)
	if got.Status != StatusWaitingForGrab || got.ObservationError == "" || got.LastObservationAttemptAt.IsZero() || !got.LastObservedAt.IsZero() {
		t.Fatalf("failed observation: %+v", got)
	}
	clock.Add(int64(8 * time.Minute))
	s.recordObservationError(got, errors.New("offline"))
	got, _ = s.Job(j.ID)
	if got.Status != StatusNeedsAttention || got.RetryReason != "" || got.occupiesSlot() {
		t.Fatal("unknown outcome failed to release slot safely")
	}
}
func TestRetryBudgetPauseAndStaleObservations(t *testing.T) {
	s, j, _ := recoveryFixture(t, "http://arr.invalid")
	if err := s.scheduleRecovery(j, "no_download", "no grab"); err != nil {
		t.Fatal(err)
	}
	deferred, _ := s.Job(j.ID)
	paused, err := s.PauseJob(j.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.updateObservedJob(deferred, StatusReady, nil); err == nil {
		t.Fatal("stale observation overwrote pause at identical timestamp")
	}
	if !paused.Paused {
		t.Fatal("pause lost")
	}
	retried, err := s.RetryJob(j.ID)
	if err != nil || retried.Paused || !retried.RetryAt.Equal(s.now()) {
		t.Fatalf("retry: %+v %v", retried, err)
	}
	if err := s.reserveRepairDispatch(retried); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.nextJob(); ok {
		t.Fatal("manual retry bypassed minimum interval")
	}
	j, err = s.updateJobDurable(j.ID, StatusWaitingForGrab, func(j *Job) { j.RetryCount = 3 })
	if err != nil {
		t.Fatal(err)
	}
	if err := s.scheduleRecovery(j, "no_download", "no grab"); err != nil {
		t.Fatal(err)
	}
	exhausted, _ := s.Job(j.ID)
	if exhausted.Status != StatusNeedsAttention || !exhausted.RetryAt.IsZero() || exhausted.occupiesSlot() {
		t.Fatal("retry budget did not stop automatic attempts")
	}
}
func TestRetryPreflightFindsLateDownloadAndBacksOffOnFailure(t *testing.T) {
	for _, name := range []string{"late queue", "late import", "offline"} {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet {
					t.Error("preflight sent mutation")
				}
				if name == "offline" {
					http.Error(w, "offline", 401)
					return
				}
				switch r.URL.Path {
				case "/api/v3/movie/9":
					if name == "late import" {
						fmt.Fprint(w, `{"id":9,"movieFile":{"id":43,"movieId":9,"path":"/library/new.mkv"}}`)
					} else {
						fmt.Fprint(w, `{"id":9}`)
					}
				case "/api/v3/command":
					fmt.Fprint(w, `[]`)
				case "/api/v3/queue":
					fmt.Fprint(w, `{"totalRecords":1,"records":[{"movieId":9,"downloadId":"late","status":"downloading"}]}`)
				case "/api/v3/history":
					fmt.Fprint(w, `{"totalRecords":0,"records":[]}`)
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			s, j, _ := recoveryFixture(t, server.URL)
			if err := s.scheduleRecovery(j, "no_download", "no grab"); err != nil {
				t.Fatal(err)
			}
			j, err := s.RetryJob(j.ID)
			if err != nil {
				t.Fatal(err)
			}
			verified := false
			s.SetImportVerifier(func(context.Context, Job) { verified = true })
			if s.prepareRecoveryRetry(t.Context(), j) {
				t.Fatal("unsafe retry admitted")
			}
			got, _ := s.Job(j.ID)
			switch name {
			case "late queue":
				if got.Status != StatusWaitingForDownload {
					t.Fatalf("late queue: %+v", got)
				}
			case "late import":
				if got.Status != StatusReady || !verified {
					t.Fatal("import not confirmed/validated")
				}
			case "offline":
				if got.Status != StatusRetryScheduled || got.RetryAt.Before(s.now().Add(time.Minute)) || got.ObservationError == "" {
					t.Fatal("failed preflight would hammer Arr")
				}
			}
		})
	}
}
func TestDownloadProgressExtendsOnlyStallDeadline(t *testing.T) {
	s, j, clock := recoveryFixture(t, "http://arr.invalid")
	snap := recoverySnapshot{queue: []arr.QueueSchema{{MovieId: 9, DownloadId: "new", Status: "downloading", Sizeleft: 1000}}}
	_, _ = s.observeRecovery(j, snap)
	j, _ = s.Job(j.ID)
	clock.Add(int64(5 * time.Hour))
	snap.queue[0].Sizeleft = 500
	_, _ = s.observeRecovery(j, snap)
	j, _ = s.Job(j.ID)
	clock.Add(int64(2 * time.Hour))
	s.maintainJobs()
	j, _ = s.Job(j.ID)
	if j.Status != StatusWaitingForDownload {
		t.Fatal("progressing download timed out")
	}
	clock.Add(int64(5 * time.Hour))
	s.maintainJobs()
	j, _ = s.Job(j.ID)
	if j.Status != StatusNeedsAttention {
		t.Fatal("stalled download held capacity forever")
	}
}

func TestRetryStartsNewAttemptWithoutReplayingOldReceipt(t *testing.T) {
	var searches atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v3/config/downloadclient":
			fmt.Fprint(w, `{"enableCompletedDownloadHandling":true}`)
		case "/api/v3/moviefile/42":
			http.NotFound(w, r)
		case "/api/v3/command":
			if r.Method != "POST" {
				t.Error("unexpected read")
			}
			searches.Add(1)
			fmt.Fprint(w, `{"id":124,"name":"MoviesSearch"}`)
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	s, j, clock := recoveryFixture(t, server.URL)
	if err := s.scheduleRecovery(j, "no_download", "no grab"); err != nil {
		t.Fatal(err)
	}
	clock.Add(int64(7 * time.Hour))
	j, _ = s.Job(j.ID)
	if !s.runJob(t.Context(), NewHandler(s.arrs), j) {
		t.Fatal("retry failed")
	}
	got, _ := s.Job(j.ID)
	if searches.Load() != 1 || got.Status != StatusWaitingForGrab || got.RetryCount != 1 || len(got.Attempts) != 1 || len(got.Mutations) != 1 || got.Mutations[0].ReceiptID != 124 || got.Attempts[0].Mutations[0].ReceiptID != 123 || !got.AttemptStartedAt.Equal(s.now()) {
		t.Fatalf("new attempt: %+v; searches=%d", got, searches.Load())
	}
}

func TestDeferredSeasonBlocksOnlyItsOwnSeason(t *testing.T) {
	s, j, _ := recoveryFixture(t, "http://arr.invalid")
	if _, err := s.updateJobDurable(j.ID, StatusReady, nil); err != nil {
		t.Fatal(err)
	}
	binding := Binding{ArrName: "shows", ArrType: arr.Sonarr, ArrInstanceFingerprint: "instance", EntryID: "show", EntryFileID: "1", ArrFileID: 1, SeriesID: 9, SeasonNumber: 1, EpisodeIDs: []int{101}, LibraryPath: "/show/1.mkv", Confidence: ConfidenceLibraryFile}
	first, err := s.enqueueLibrary(Request{EntryID: binding.EntryID, FileID: binding.EntryFileID, Cause: CauseRepair, Strategy: StrategyCommandSearch}, binding)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.scheduleRecovery(*first, "no_download", "no grab"); err != nil {
		t.Fatal(err)
	}
	binding.EntryFileID = "2"
	binding.ArrFileID = 2
	binding.EpisodeIDs = []int{102}
	binding.LibraryPath = "/show/2.mkv"
	sibling, err := s.enqueueLibrary(Request{EntryID: binding.EntryID, FileID: binding.EntryFileID, Cause: CauseRepair, Strategy: StrategyCommandSearch}, binding)
	if err != nil {
		t.Fatal(err)
	}
	other := queuedRepairForTest(t, s, 88, CauseRepair)
	next, ok := s.nextJob()
	if !ok || next.ID != other.ID {
		t.Fatalf("season blocked unrelated media: next=%s sibling=%s", next.ID, sibling.ID)
	}
}

func TestQueuedRepairDoesNotExpireBeforeItsFirstDispatch(t *testing.T) {
	s, j, clock := recoveryFixture(t, "http://arr.invalid")
	_, _ = s.updateJobDurable(j.ID, StatusReady, nil)
	queued := queuedRepairForTest(t, s, 88, CauseRepair)
	clock.Add(int64(72 * time.Hour))
	handler := &waitingReacquireHandler{called: make(chan string, 1)}
	if !s.runJob(t.Context(), handler, *queued) {
		t.Fatal("old queued job refused first dispatch")
	}
	got, _ := s.Job(queued.ID)
	if got.Status != StatusWaitingForImport {
		t.Fatalf("backlog expired before it ran: %s", got.Status)
	}
}

func TestCompletedSearchWithoutEndedTimestampKeepsFirstObservation(t *testing.T) {
	s, j, clock := recoveryFixture(t, "http://arr.invalid")
	snap := completedSearch(s)
	snap.commands[0].Ended = time.Time{}
	_, _ = s.observeRecovery(j, snap)
	j, _ = s.Job(j.ID)
	first := j.SearchCompletedAt
	clock.Add(int64(time.Minute))
	_, _ = s.observeRecovery(j, snap)
	j, _ = s.Job(j.ID)
	if !j.SearchCompletedAt.Equal(first) {
		t.Fatal("polling indefinitely reset grace period")
	}
	clock.Add(int64(2 * time.Minute))
	_, _ = s.observeRecovery(j, snap)
	j, _ = s.Job(j.ID)
	if j.Status != StatusRetryScheduled {
		t.Fatal("completed search without timestamp never rescheduled")
	}
}

func TestManualRecoveryDoesNotInheritAutomaticRepairRetries(t *testing.T) {
	s, _, clock := recoveryFixture(t, "http://arr.invalid")
	manual := queuedRepairForTest(t, s, 88, CauseManual)
	j, err := s.updateJobDurable(manual.ID, StatusWaitingForGrab, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.observeRecovery(j, completedSearch(s)); err != nil {
		t.Fatal(err)
	}
	j, _ = s.Job(j.ID)
	if j.Status != StatusWaitingForGrab {
		t.Fatal("manual recovery entered automatic retry policy")
	}
	clock.Add(int64(7 * time.Hour))
	s.maintainJobs()
	j, _ = s.Job(j.ID)
	if j.Status != StatusFailed {
		t.Fatal("observations erased the existing manual recovery timeout")
	}
}
