package reacquire

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/pkg/arr"
)

func fallbackCandidate(hash string, seeders *int) UncachedCandidate {
	release := arr.Release{GUID: hash, Indexer: "test", IndexerID: 1, DownloadAllowed: true, Seeders: seeders, Payload: []byte(`{"guid":"test"}`)}
	return UncachedCandidate{Release: release, Payload: release.Payload, Hash: hash}
}

func TestUncachedCandidateProofAndOrdering(t *testing.T) {
	positive, zero := 8, 0
	unknown := fallbackCandidate(strings.Repeat("a", 40), nil)
	seeded := fallbackCandidate(strings.Repeat("b", 40), &positive)
	empty := fallbackCandidate(strings.Repeat("c", 40), &zero)
	candidates := []UncachedCandidate{unknown, empty, seeded, seeded}
	job := Job{}
	var releases []arr.Release
	for _, candidate := range candidates {
		releases = append(releases, candidate.Release)
		setMutation(&job, Mutation{Key: mutationKey(MutationReleaseGrab, candidate.Release.GUID, "1"), State: MutationRejected, RejectionHash: candidate.Hash})
	}
	selected := uncachedCandidates(job, releases)
	if len(selected) != 2 || selected[0].Hash != seeded.Hash || selected[1].Hash != unknown.Hash {
		t.Fatalf("candidates=%+v", selected)
	}
	job.Mutations[0].RejectionHash = ""
	if got := uncachedCandidates(job, releases); len(got) != 0 {
		t.Fatal("missing rejection identity authorized fallback")
	}
	job.Mutations[0].RejectionHash = unknown.Hash
	job.Mutations[0].State = MutationIntent
	if got := uncachedCandidates(job, releases); len(got) != 0 {
		t.Fatal("incomplete rejection set authorized fallback")
	}
	job.Mutations[0].State = MutationRejected
	releases[0].InfoHash = seeded.Hash
	if got := uncachedCandidates(job, releases); len(got) != 0 {
		t.Fatal("conflicting identity authorized fallback")
	}
}

func waitingFallback(t *testing.T, service *Service, job Job) Job {
	t.Helper()
	updated, err := service.updateJobDurable(job.ID, StatusWaitingForDownload, func(current *Job) {
		current.Mutations = nil
		current.Uncached = &UncachedRecovery{Phase: UncachedWaiting, Candidates: []UncachedCandidate{fallbackCandidate(strings.Repeat("a", 40), nil), fallbackCandidate(strings.Repeat("b", 40), nil)}}
	})
	if err != nil {
		t.Fatal(err)
	}
	return updated
}

func TestUncachedReservationAuthorizationAndRestart(t *testing.T) {
	service, job, _ := recoveryFixture(t, "http://arr.test")
	config.Get().Repair.UncachedRecoveryFallback = true
	job = waitingFallback(t, service, job)
	second := cloneJob(job)
	second.ID += "-second"
	second.EntryID += "-second"
	second.Uncached.Candidates = []UncachedCandidate{fallbackCandidate(strings.Repeat("c", 40), nil)}
	if err := service.jobRepository.SaveDurable(second); err != nil {
		t.Fatal(err)
	}
	service.jobsMu.Lock()
	service.jobs[second.ID] = second
	service.jobsMu.Unlock()
	var workers sync.WaitGroup
	successes := make(chan Job, 12)
	for index := range 12 {
		candidate := job
		if index%2 == 1 {
			candidate = second
		}
		workers.Go(func() {
			reserved, ok, _ := service.reserveUncached(candidate)
			if ok {
				successes <- reserved
			}
		})
	}
	workers.Wait()
	close(successes)
	if len(successes) != 1 {
		t.Fatalf("reservations=%d", len(successes))
	}
	reserved := <-successes
	job = reserved
	stored, err := service.jobRepository.LoadAll()
	if err != nil {
		t.Fatal(err)
	}
	if err := service.loadJobs(stored); err != nil {
		t.Fatal(err)
	}
	if _, ok, err := service.reserveUncached(job); err != nil || ok {
		t.Fatalf("restart lost capacity: %v %v", ok, err)
	}
	instance, _ := service.arrs.Get(job.ArrName)
	if id, err := service.ConsumeUncachedAuthorization(instance, strings.Repeat("f", 40)); id != "" || err != nil {
		t.Fatal("authorized unrelated hash")
	}
	wrong := instance
	wrong.Token = "other"
	if _, err := service.ConsumeUncachedAuthorization(wrong, reserved.Uncached.SelectedHash); err == nil {
		t.Fatal("authorized another Arr identity")
	}
	id, err := service.ConsumeUncachedAuthorization(instance, reserved.Uncached.SelectedHash)
	if err != nil || id != job.ID {
		t.Fatalf("consume: %s %v", id, err)
	}
	if _, err := service.ConsumeUncachedAuthorization(instance, reserved.Uncached.SelectedHash); err == nil {
		t.Fatal("consumed twice")
	}
	if err := service.RecordUncachedPlacement(UncachedPlacement{JobID: id, Provider: "provider", ProviderID: "owned"}); err != nil {
		t.Fatal(err)
	}
	current, _ := service.Job(id)
	if err := service.attention(current, "test ambiguity"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.AcknowledgeJob(id); err == nil {
		t.Fatal("acknowledgement discarded owned reservation")
	}
	if service.RepairQueueStatus().UncachedReserved != 1 {
		t.Fatal("missing capacity in queue API")
	}
}

type fallbackBackend struct {
	observation    UncachedObservation
	observationErr error
	cleanupErr     error
	cleanups       int
}

func (backend *fallbackBackend) ObserveUncached(context.Context, Job) (UncachedObservation, error) {
	return backend.observation, backend.observationErr
}
func (backend *fallbackBackend) CleanupUncached(context.Context, Job) error {
	backend.cleanups++
	return backend.cleanupErr
}

func TestUncachedProgressStallCleanupAndDisable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/queue" {
			fmt.Fprint(w, `{"records":[],"totalRecords":0}`)
			return
		}
		fmt.Fprint(w, `{ "id": 9, "hasFile": false }`)
	}))
	defer server.Close()
	service, job, clock := recoveryFixture(t, server.URL)
	config.Get().Repair.UncachedRecoveryFallback = true
	job = waitingFallback(t, service, job)
	job, _, err := service.reserveUncached(job)
	if err != nil {
		t.Fatal(err)
	}
	instance, _ := service.arrs.Get(job.ArrName)
	if _, err := service.ConsumeUncachedAuthorization(instance, job.Uncached.SelectedHash); err != nil {
		t.Fatal(err)
	}
	if err := service.RecordUncachedPlacement(UncachedPlacement{JobID: job.ID, Provider: "provider", ProviderID: "owned"}); err != nil {
		t.Fatal(err)
	}
	backend := &fallbackBackend{observation: UncachedObservation{DownloadedBytes: 100}}
	service.uncachedBackend = backend
	reconcile := func() {
		t.Helper()
		current, _ := service.Job(job.ID)
		if err := service.reconcileUncached(t.Context(), current); err != nil {
			t.Fatal(err)
		}
	}
	reconcile()
	// A progressing download has no total-duration limit, even after disabling fallback.
	config.Get().Repair.UncachedRecoveryFallback = false
	clock.Add(int64(8 * time.Hour))
	backend.observation.DownloadedBytes = 200
	reconcile()
	current, _ := service.Job(job.ID)
	if current.Uncached.LastBytes != 200 || !current.Uncached.Reserved {
		t.Fatal("progressing download lost reservation")
	}
	service.maintainJobs()
	current, _ = service.Job(job.ID)
	if current.Status == StatusNeedsAttention {
		t.Fatal("ordinary deadline stopped progressing download")
	}
	clock.Add(int64(3 * time.Hour))
	backend.observationErr = errors.New("unavailable")
	if err := service.reconcileUncached(t.Context(), current); err == nil || backend.cleanups != 0 {
		t.Fatal("observation failure established stall")
	}
	backend.observationErr = nil
	backend.cleanupErr = errors.New("cleanup unavailable")
	current, _ = service.Job(job.ID)
	if err := service.reconcileUncached(t.Context(), current); err == nil {
		t.Fatal("cleanup failure hidden")
	}
	current, _ = service.Job(job.ID)
	if !current.Uncached.Reserved || current.Uncached.Phase != UncachedCleanup {
		t.Fatal("cleanup failure released capacity")
	}
	// Completion during a cleanup retry cancels deletion and releases capacity.
	backend.observation.Complete = true
	reconcile()
	current, _ = service.Job(job.ID)
	if current.Uncached.Reserved || current.Uncached.Phase != UncachedComplete || backend.cleanups != 1 {
		t.Fatal("completion was not preserved")
	}
}

func TestUncachedCleanupTriesNextHashWithoutRetryBudget(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/queue" {
			fmt.Fprint(w, `{"records":[],"totalRecords":0}`)
			return
		}
		fmt.Fprint(w, `{ "id": 9, "hasFile": false }`)
	}))
	defer server.Close()
	service, job, _ := recoveryFixture(t, server.URL)
	config.Get().Repair.UncachedRecoveryFallback = true
	job = waitingFallback(t, service, job)
	job, _, _ = service.reserveUncached(job)
	instance, _ := service.arrs.Get(job.ArrName)
	_, _ = service.ConsumeUncachedAuthorization(instance, job.Uncached.SelectedHash)
	if err := service.RecordUncachedPlacement(UncachedPlacement{JobID: job.ID, Provider: "provider", ProviderID: "owned"}); err != nil {
		t.Fatal(err)
	}
	service.uncachedBackend = &fallbackBackend{observation: UncachedObservation{Failed: true}}
	job, _ = service.Job(job.ID)
	if err := service.reconcileUncached(t.Context(), job); err != nil {
		t.Fatal(err)
	}
	job, _ = service.Job(job.ID)
	next, ok, err := service.reserveUncached(job)
	if err != nil || !ok || next.Uncached.SelectedHash != strings.Repeat("b", 40) || next.RetryCount != job.RetryCount {
		t.Fatalf("next=%+v err=%v", next.Uncached, err)
	}
}

func TestFallbackRequiresSuccessfulSearchAndAllRejections(t *testing.T) {
	for _, scenario := range []string{"all_rejected", "cached_available", "search_error", "generic_grab_error", "missing_hash"} {
		t.Run(scenario, func(t *testing.T) {
			hash := strings.Repeat("a", 40)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet {
					if scenario == "search_error" {
						w.WriteHeader(503)
						return
					}
					fmt.Fprint(w, `[{"guid":"first","indexer":"test","indexerId":1,"approved":true,"fullSeason":true,"seasonNumber":2,"seeders":5}]`)
					return
				}
				if scenario == "cached_available" {
					w.WriteHeader(201)
					return
				}
				w.WriteHeader(500)
				switch scenario {
				case "generic_grab_error":
					fmt.Fprint(w, `{"message":"unavailable"}`)
				case "missing_hash":
					fmt.Fprint(w, `{"code":"torrent_not_cached"}`)
				default:
					fmt.Fprintf(w, `{"code":"torrent_not_cached","infoHash":%q}`, hash)
				}
			}))
			defer server.Close()
			configureRepairQueueTest(t)
			config.Get().Repair.UncachedRecoveryFallback = true
			handler, instance := seasonTestHandler(server.URL)
			cachedOnly := false
			instance.DownloadUncached = &cachedOnly
			job := Job{Cause: CauseRepair}
			progress := &fallbackProgress{}
			_, _ = handler.grabReplacementRelease(t.Context(), instance, &job, seasonTestBindings(), progress, true)
			if (progress.job.Uncached != nil) != (scenario == "all_rejected") {
				t.Fatalf("fallback=%+v", progress.job.Uncached)
			}
		})
	}
}

type fallbackProgress struct{ job Job }

func (progress *fallbackProgress) Update(status Status, mutate func(*Job)) error {
	return progress.UpdateDurable(status, mutate)
}
func (progress *fallbackProgress) UpdateDurable(status Status, mutate func(*Job)) error {
	progress.job.Status = status
	if mutate != nil {
		mutate(&progress.job)
	}
	return nil
}
