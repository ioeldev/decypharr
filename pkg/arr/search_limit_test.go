package arr

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestReleaseSearchRateLimitHonorsHeaderAndPausesOnlyItsArr(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("X-Api-Key") == "limited" {
			w.Header().Set("Retry-After", "420")
			w.WriteHeader(429)
			fmt.Fprint(w, `{"error":"rate limited"}`)
			return
		}
		fmt.Fprint(w, `[]`)
	}))
	defer server.Close()
	s := testService(Arr{Host: server.URL, Type: Sonarr, Token: "limited"})
	s.AddOrUpdate(Arr{Name: "other", Host: server.URL + "/other", Type: Sonarr, Token: "other"})
	before := time.Now()
	_, err := s.SeasonReleases(t.Context(), "arr", 7, 2)
	var limit *SearchRateLimitError
	if !errors.As(err, &limit) || limit.RetryAt.Before(before.Add(420*time.Second)) {
		t.Fatalf("rate limit=%+v err=%v", limit, err)
	}
	if calls.Load() != 1 {
		t.Fatal("429 repeated inline")
	}
	_, err = s.SeasonReleases(t.Context(), "arr", 8, 3)
	if !errors.As(err, &limit) || calls.Load() != 1 {
		t.Fatalf("cooldown ignored: %v calls=%d", err, calls.Load())
	}
	if _, err = s.SeasonReleases(t.Context(), "other", 7, 2); err != nil || calls.Load() != 2 {
		t.Fatalf("other Arr blocked: %v", err)
	}
	// A request already in flight when the 429 arrived cannot clear its cooldown.
	instance, _ := s.Get("arr")
	s.searchSucceeded(instance)
	if !s.SearchRetryAt("arr").After(time.Now()) {
		t.Fatal("success erased current cooldown")
	}
}

func TestSearchCooldownDateBackoffAndContextCancellation(t *testing.T) {
	s := testService(Arr{Host: "http://example.test", Type: Sonarr, Token: "secret"})
	instance, _ := s.Get("arr")
	date := time.Now().Add(10 * time.Minute).UTC().Truncate(time.Second)
	e := s.rateLimitSearch(instance, date.Format(http.TimeFormat)).(*SearchRateLimitError)
	if !e.RetryAt.Equal(date) {
		t.Fatalf("HTTP date not respected: %v", e.RetryAt)
	}
	s.searchCooldown = map[string]searchCooldown{}
	first := s.rateLimitSearch(instance, "").(*SearchRateLimitError).RetryAt
	second := s.rateLimitSearch(instance, "invalid").(*SearchRateLimitError).RetryAt
	if !second.After(first.Add(20 * time.Second)) {
		t.Fatal("backoff did not grow")
	}
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); <-r.Context().Done() }))
	defer server.Close()
	service := testService(Arr{Host: server.URL, Type: Sonarr, Token: "secret"})
	ctx, cancel := context.WithTimeout(t.Context(), 50*time.Millisecond)
	defer cancel()
	_, err := service.SeasonReleases(ctx, "arr", 7, 2)
	if !errors.Is(err, context.DeadlineExceeded) || !errors.Is(err, ErrReleaseSearch) || calls.Load() != 1 {
		t.Fatalf("search deadline/repeats: %v calls=%d", err, calls.Load())
	}
}
