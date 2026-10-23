package reacquire

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/sirrobot01/decypharr/pkg/arr"
)

func TestCacheRejectionTriesNextPackAndPersistsReceipt(t *testing.T) {
	var grabbed []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			fmt.Fprint(w, `[{"guid":"uncached","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"downloadAllowed":true},{"guid":"cached","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"downloadAllowed":true}]`)
			return
		}
		var release arr.Release
		json.NewDecoder(r.Body).Decode(&release)
		grabbed = append(grabbed, release.GUID)
		if release.GUID == "uncached" {
			w.WriteHeader(500)
			fmt.Fprint(w, `{"code":"torrent_not_cached"}`)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()
	handler, instance := seasonTestHandler(server.URL)
	job := Job{}
	status, err := handler.seasonPackFirst(t.Context(), instance, &job, seasonTestBindings(), &recordedProgress{})
	if err != nil || status != StatusWaitingForDownload {
		t.Fatalf("status=%s err=%v", status, err)
	}
	if !reflect.DeepEqual(grabbed, []string{"uncached", "cached"}) {
		t.Fatalf("grabs=%v", grabbed)
	}
	if len(job.Mutations) != 2 || job.Mutations[0].State != MutationRejected || job.Mutations[1].State != MutationConfirmed {
		t.Fatalf("mutations=%+v", job.Mutations)
	}
	if err := job.Mutations[0].validate(); err != nil {
		t.Fatal(err)
	}
	// Serialize/reload, then resume: confirmed success must prevent a second grab.
	data, _ := json.Marshal(job)
	var restored Job
	json.Unmarshal(data, &restored)
	if _, err := handler.seasonPackFirst(t.Context(), instance, &restored, seasonTestBindings(), &recordedProgress{}); err != nil {
		t.Fatal(err)
	}
	if len(grabbed) != 2 {
		t.Fatalf("replayed grabs=%v", grabbed)
	}
}

func TestRejectedPacksRemainSkippedAfterReload(t *testing.T) {
	grabs := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			fmt.Fprint(w, `[{"guid":"uncached","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"downloadAllowed":true}]`)
			return
		}
		if r.URL.Path != "/api/v3/release" {
			t.Error("all-uncached candidates must not fall back to a duplicate episode search")
		}
		grabs++
		w.WriteHeader(500)
		fmt.Fprint(w, `{"code":"torrent_not_cached"}`)
	}))
	defer server.Close()
	handler, instance := seasonTestHandler(server.URL)
	job := Job{}
	for range 2 {
		_, err := handler.seasonPackFirst(t.Context(), instance, &job, seasonTestBindings(), &recordedProgress{})
		if !errors.Is(err, errNoReplacement) {
			t.Fatalf("err=%v", err)
		}
		data, _ := json.Marshal(job)
		json.Unmarshal(data, &job)
	}
	if grabs != 1 {
		t.Fatalf("rejected release submitted %d times", grabs)
	}
}

func TestGenericGrabFailureNeverSelectsNextRelease(t *testing.T) {
	grabs := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/v3/history" {
			fmt.Fprint(w, `{"records":[],"totalRecords":0}`)
			return
		}
		if r.Method == http.MethodGet {
			fmt.Fprint(w, `[{"guid":"first","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"downloadAllowed":true},{"guid":"second","fullSeason":true,"seasonNumber":2,"indexer":"test","indexerId":1,"downloadAllowed":true}]`)
			return
		}
		grabs++
		w.WriteHeader(500)
		fmt.Fprint(w, `{"message":"download client unavailable"}`)
	}))
	defer server.Close()
	handler, instance := seasonTestHandler(server.URL)
	job := Job{}
	_, err := handler.seasonPackFirst(t.Context(), instance, &job, seasonTestBindings(), &recordedProgress{})
	if !errors.Is(err, arr.ErrMutationOutcomeUnknown) || grabs != 1 || job.Mutations[0].State != MutationIntent {
		t.Fatalf("err=%v grabs=%d job=%+v", err, grabs, job)
	}
}

func TestCacheRejectionSchedulesRetryAndFreesSlot(t *testing.T) {
	s, j, _ := recoveryFixture(t, "http://arr.invalid")
	other := queuedRepairForTest(t, s, 88, CauseRepair)
	now := s.now()
	job, err := s.updateJobDurable(j.ID, StatusSearching, func(job *Job) {
		job.Mutations = []Mutation{{Key: "release_grab:first:1", Kind: MutationReleaseGrab, State: MutationRejected, ReleaseGUID: "first", ReleaseIndexer: "test", ReleaseIndexerID: 1, MovieIDs: []int{9}, IntentAt: now, LastDispatchedAt: now, Attempts: 1, RejectedAt: now, RejectionCode: "torrent_not_cached"}}
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.scheduleRecovery(job, "no_download", "No cached replacement found"); err != nil {
		t.Fatal(err)
	}
	deferred, _ := s.Job(j.ID)
	if deferred.Status != StatusRetryScheduled || !deferred.RetryAt.After(now) || deferred.occupiesSlot() {
		t.Fatalf("deferred=%+v", deferred)
	}
	if next, ok := s.nextJob(); !ok || next.ID != other.ID {
		t.Fatalf("next=%s ok=%v", next.ID, ok)
	}
}

type rejectReceiptFailure struct{ recordedProgress }

func (p *rejectReceiptFailure) UpdateDurable(status Status, mutate func(*Job)) error {
	var job Job
	if mutate != nil {
		mutate(&job)
	}
	for _, m := range job.Mutations {
		if m.State == MutationRejected {
			return errors.New("disk full")
		}
	}
	return nil
}

func TestRejectedReceiptMustBeDurableBeforeAnotherGrab(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		fmt.Fprint(w, `{"code":"torrent_not_cached"}`)
	}))
	defer server.Close()
	handler, instance := seasonTestHandler(server.URL)
	release := arr.Release{GUID: "first", Indexer: "test", IndexerID: 1, Payload: json.RawMessage(`{"guid":"first"}`)}
	mutation, err := releaseMutation(seasonTestBindings(), release)
	if err != nil {
		t.Fatal(err)
	}
	mutation.State = MutationIntent
	mutation.IntentAt = time.Now()
	job := Job{Mutations: []Mutation{mutation}}
	_, err = handler.dispatchReleaseMutation(t.Context(), instance, &job, mutation, release, &rejectReceiptFailure{})
	if !errors.Is(err, arr.ErrMutationOutcomeUnknown) || job.Mutations[0].State != MutationIntent {
		t.Fatalf("err=%v job=%+v", err, job)
	}
}

func TestCacheMissKeepsRetryingAfterOrdinaryRetryBudget(t *testing.T) {
	service, job, _ := recoveryFixture(t, "http://arr.invalid")
	job, err := service.updateJobDurable(job.ID, StatusSearching, func(current *Job) {
		current.Mutations = nil
		current.RetryCount = 100
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.scheduleRecovery(job, "cache_miss", "No cached replacement found"); err != nil {
		t.Fatal(err)
	}
	deferred, _ := service.Job(job.ID)
	if deferred.Status != StatusRetryScheduled || !deferred.RetryAt.After(service.now()) || deferred.RetryAt.Sub(service.now()) > 7*24*time.Hour {
		t.Fatalf("cache miss should retain a bounded retry: %+v", deferred)
	}
	if deferred.occupiesSlot() {
		t.Fatal("cache miss holds an active slot")
	}
}

func TestRejectedReceiptSurvivesRepositoryReopen(t *testing.T) {
	service, job, _ := recoveryFixture(t, "http://arr.invalid")
	now := service.now()
	job.Mutations = []Mutation{{Key: "release_grab:first:1", Kind: MutationReleaseGrab, State: MutationRejected,
		ReleaseGUID: "first", ReleaseIndexer: "test", ReleaseIndexerID: 1, MovieIDs: []int{9},
		IntentAt: now, LastDispatchedAt: now, Attempts: 1, RejectedAt: now, RejectionCode: "torrent_not_cached"}}
	path := t.TempDir() + "/jobs.db"
	repository, err := OpenReacquireJobRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.SaveDurable(job); err != nil {
		t.Fatal(err)
	}
	if err := repository.Close(); err != nil {
		t.Fatal(err)
	}
	repository, err = OpenReacquireJobRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	defer repository.Close()
	restored, ok, err := repository.Get(job.ID)
	if err != nil || !ok || len(restored.Mutations) != 1 || restored.Mutations[0].State != MutationRejected {
		t.Fatalf("restored=%+v ok=%v err=%v", restored, ok, err)
	}
	if _, found := mutationOfKind(restored, MutationReleaseGrab); found {
		t.Fatal("rejected mutation became dispatchable after reopening")
	}
}
