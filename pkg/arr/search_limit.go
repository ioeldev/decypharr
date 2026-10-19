package arr

import (
	"fmt"
	"net/http"
	"strconv"
	"time"
)

type SearchRateLimitError struct {
	ArrName string
	RetryAt time.Time
}

func (e *SearchRateLimitError) Error() string {
	return fmt.Sprintf("Arr %s rate-limited release searches (429); retry after %s", e.ArrName, e.RetryAt.UTC().Format(time.RFC3339))
}

type searchCooldown struct {
	Until    time.Time
	Failures int
}

// Only release discovery is paused; queue/history/import observation stays live.
func (s *Service) SearchRetryAt(name string) time.Time {
	instance, err := s.instance(name)
	if err != nil {
		return time.Time{}
	}
	s.searchMu.Lock()
	defer s.searchMu.Unlock()
	return s.searchCooldown[instance.Fingerprint()].Until
}
func (s *Service) rateLimitSearch(instance Arr, header string) error {
	now := time.Now()
	s.searchMu.Lock()
	defer s.searchMu.Unlock()
	if s.searchCooldown == nil {
		s.searchCooldown = make(map[string]searchCooldown)
	}
	key := instance.Fingerprint()
	state := s.searchCooldown[key]
	state.Failures++
	delay := 30 * time.Second * time.Duration(1<<min(state.Failures-1, 6))
	delay = min(delay, 30*time.Minute)
	until := now.Add(delay)
	if secs, err := strconv.ParseInt(header, 10, 64); err == nil && secs > 0 && secs <= int64((365*24*time.Hour)/time.Second) {
		until = now.Add(time.Duration(secs) * time.Second)
	} else if date, err := http.ParseTime(header); err == nil && date.After(now) {
		until = date
	}
	if state.Until.After(until) {
		until = state.Until
	}
	state.Until = until
	s.searchCooldown[key] = state
	return &SearchRateLimitError{ArrName: instance.Name, RetryAt: until}
}
func (s *Service) searchSucceeded(instance Arr) {
	s.searchMu.Lock()
	defer s.searchMu.Unlock()
	key := instance.Fingerprint()
	// An in-flight success must not erase another worker's newly received 429.
	if !time.Now().Before(s.searchCooldown[key].Until) {
		delete(s.searchCooldown, key)
	}
}
