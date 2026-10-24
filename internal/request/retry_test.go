package request

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/sirrobot01/decypharr/internal/config"
)

func TestRetryPolicyPreservesUnlistedProviderStatus(t *testing.T) {
	config.SetConfigPath(t.TempDir())
	t.Cleanup(config.Reset)
	for _, explicit := range []bool{false, true} {
		t.Run(map[bool]string{false: "provider response", true: "configured retry"}[explicit], func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.WriteHeader(509)
				_, _ = io.WriteString(w, `{"error":"active_downloads_limit"}`)
			}))
			defer server.Close()
			opts := []ClientOption{WithMaxRetries(0)}
			if explicit {
				opts = append(opts, WithRetryableStatus(509))
			}
			req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, server.URL, nil)
			if err != nil {
				t.Fatal(err)
			}
			resp, err := New(opts...).Do(req)
			if calls.Load() != 1 {
				t.Fatalf("calls = %d", calls.Load())
			}
			if explicit {
				if err == nil {
					DrainAndClose(resp.Body)
					t.Fatal("configured retry did not reach its limit")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			defer DrainAndClose(resp.Body)
			body, err := io.ReadAll(resp.Body)
			if err != nil || resp.StatusCode != 509 || string(body) != `{"error":"active_downloads_limit"}` {
				t.Fatalf("response = %d %q, error = %v", resp.StatusCode, body, err)
			}
		})
	}
}

func TestDoOnceDoesNotReplayRetryableMutation(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { attempts++; w.WriteHeader(http.StatusBadGateway) }))
	defer server.Close()
	client := New(WithMaxRetries(3), WithRetryableStatus(http.StatusBadGateway))
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, server.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.DoOnce(req)
	if err != nil {
		t.Fatal(err)
	}
	DrainAndCloseResponse(response)
	if attempts != 1 || response.StatusCode != http.StatusBadGateway {
		t.Fatalf("attempts=%d status=%d", attempts, response.StatusCode)
	}
}
