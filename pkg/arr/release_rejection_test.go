package arr

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGrabReleaseDistinguishesCacheRejectionFromUncertainResponse(t *testing.T) {
	nested, _ := json.Marshal(map[string]string{"message": "Failed to connect to qBittorrent", "description": "NzbDrone.Core.Download.Clients.DownloadClientException: failed\nQBittorrentProxyV2\n{\"code\":\"torrent_not_cached\",\"error\":\"failed to submit torrent: torrent not cached\"}\n at QBittorrent.AddFromTorrentFile"})
	for _, test := range []struct {
		name, body        string
		status            int
		cached, uncertain bool
	}{
		{"wrapped Sonarr rejection", string(nested), 500, true, false},
		{"direct rejection", `{"code":"torrent_not_cached"}`, 404, true, false},
		{"generic server failure", `{"message":"Failed to connect to qBittorrent"}`, 500, false, true},
		{"message alone is not proof", `{"message":"torrent_not_cached"}`, 500, false, true},
		{"malformed response", `{"code":"torrent_not_cached"`, 500, false, true},
		{"oversized response", `{"code":"torrent_not_cached","padding":"` + strings.Repeat("x", maxReleaseErrorBytes) + `"}`, 500, false, true},
		{"success wins", `{"code":"torrent_not_cached"}`, 201, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				w.WriteHeader(test.status)
				fmt.Fprint(w, test.body)
			}))
			defer server.Close()
			s := testService(Arr{Host: server.URL, Token: "secret", Type: Sonarr})
			err := s.GrabRelease(t.Context(), "arr", Release{GUID: "pack", IndexerID: 1, Payload: json.RawMessage(`{"guid":"pack"}`)})
			if errors.Is(err, ErrReleaseNotCached) != test.cached || errors.Is(err, ErrMutationOutcomeUnknown) != test.uncertain {
				t.Fatalf("error = %v", err)
			}
			if calls != 1 {
				t.Fatalf("mutation was retried %d times", calls)
			}
		})
	}
}

func TestGrabReleaseDisconnectRemainsUncertain(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, _, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		conn.Close()
	}))
	defer server.Close()
	s := testService(Arr{Host: server.URL, Token: "secret", Type: Sonarr})
	err := s.GrabRelease(t.Context(), "arr", Release{GUID: "pack", IndexerID: 1, Payload: json.RawMessage(`{"guid":"pack"}`)})
	if !errors.Is(err, ErrMutationOutcomeUnknown) || errors.Is(err, ErrReleaseNotCached) {
		t.Fatalf("error = %v", err)
	}
}

func TestCacheRejectionHashRequiresUnambiguousIdentity(t *testing.T) {
	hash := strings.Repeat("a", 40)
	direct := `{"code":"torrent_not_cached","infoHash":"` + hash + `"}`
	if got := cacheRejectionHash([]byte(direct)); got != hash {
		t.Fatalf("direct=%q", got)
	}
	wrapped, _ := json.Marshal(map[string]string{"description": "DownloadClientException QBittorrent: " + `{"code":"torrent_not_cached","error":"torrent not cached","infoHash":"` + hash + `"}`})
	if got := cacheRejectionHash(wrapped); got != hash {
		t.Fatalf("wrapped=%q", got)
	}
	ambiguous, _ := json.Marshal(map[string]string{"description": "DownloadClientException QBittorrent: " + direct + ` {"code":"torrent_not_cached","error":"torrent not cached","infoHash":"` + strings.Repeat("b", 40) + `"}`})
	if got := cacheRejectionHash(ambiguous); got != "" {
		t.Fatalf("ambiguous=%q", got)
	}
	for _, response := range []string{`{"code":"torrent_not_cached"}`, `{"code":"torrent_not_cached","infoHash":"bad"}`, `{"message":"torrent_not_cached","infoHash":"` + hash + `"}`} {
		if got := cacheRejectionHash([]byte(response)); got != "" {
			t.Fatalf("unproven=%q", got)
		}
	}
}
