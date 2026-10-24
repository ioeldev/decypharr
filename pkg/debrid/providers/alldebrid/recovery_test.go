package alldebrid

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/internal/request"
	"github.com/sirrobot01/decypharr/internal/utils"
	"github.com/sirrobot01/decypharr/pkg/debrid/types"
)

const recoveryHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func TestRecoveryInventoryRequiresCompleteSnapshot(t *testing.T) {
	for _, scenario := range []struct {
		name, body string
		valid      bool
	}{
		{"active and ready", `{"status":"success","data":{"magnets":[{"id":1,"hash":"a","statusCode":1},{"id":2,"hash":"b","statusCode":4}]}}`, true},
		{"empty", `{"status":"success","data":{"magnets":[]}}`, true},
		{"missing", `{"status":"success","data":{}}`, false},
		{"null", `{"status":"success","data":{"magnets":null}}`, false},
		{"missing hash", `{"status":"success","data":{"magnets":[{"id":1}]}}`, false},
		{"duplicate", `{"status":"success","data":{"magnets":[{"id":1,"hash":"a"},{"id":1,"hash":"a"}]}}`, false},
		{"api error", `{"status":"error","error":{"code":"AUTH_BAD_APIKEY"}}`, false},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.RawQuery != "" {
					t.Errorf("filtered inventory: %s", r.URL.RawQuery)
				}
				fmt.Fprint(w, scenario.body)
			}))
			defer server.Close()
			provider := testAllDebrid(server.URL)
			provider.config.Limit = 1
			inventory, err := provider.RecoveryInventory(t.Context())
			if (err == nil) != scenario.valid {
				t.Fatalf("inventory=%v err=%v", inventory, err)
			}
			if scenario.name == "active and ready" && (len(inventory) != 2 || inventory[0].Status != types.TorrentStatusDownloading) {
				t.Fatal("active inventory lost")
			}
		})
	}
}

func TestRecoverySubmissionIsSingleAttemptAndValidatesReceipt(t *testing.T) {
	for _, scenario := range []struct {
		name, body string
		code       int
		valid      bool
	}{
		{"accepted", `{"status":"success","data":{"magnets":[{"id":42,"hash":"` + recoveryHash + `"}]}}`, 200, true},
		{"ambiguous", `{"status":"success","data":{"magnets":[]}}`, 200, false},
		{"wrong hash", `{"status":"success","data":{"magnets":[{"id":42,"hash":"wrong"}]}}`, 200, false},
		{"item error", `{"status":"success","data":{"magnets":[{"error":{"code":"MAGNET_TOO_MANY_ACTIVE"}}]}}`, 200, false},
		{"api error", `{"status":"error","error":{"code":"MAGNET_TOO_MANY_ACTIVE"}}`, 200, false},
		{"retryable", `{}`, 502, false},
		{"truncated", `{"status":`, 200, false},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.Method != http.MethodPost || r.URL.Path != "/v4/magnet/upload" {
					t.Errorf("request %s %s", r.Method, r.URL.Path)
				}
				if err := r.ParseForm(); err != nil || r.Form.Get("magnets[]") == "" {
					t.Error("missing magnet")
				}
				w.WriteHeader(scenario.code)
				fmt.Fprint(w, scenario.body)
			}))
			defer server.Close()
			provider := testAllDebrid(server.URL + "/v4.1")
			provider.client = request.New(request.WithMaxRetries(3), request.WithRetryableStatus(502))
			torrent, err := provider.SubmitRecovery(t.Context(), &types.Torrent{InfoHash: recoveryHash, Magnet: &utils.Magnet{Link: "magnet:?xt=urn:btih:" + recoveryHash}})
			if (err == nil) != scenario.valid || calls.Load() != 1 {
				t.Fatalf("calls=%d torrent=%v err=%v", calls.Load(), torrent, err)
			}
			if scenario.valid && torrent.Id != "42" {
				t.Fatal("lost placement")
			}
		})
	}
}

func TestRecoveryTorrentFileSubmission(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v4/magnet/upload/file" {
			t.Errorf("path=%s", r.URL.Path)
		}
		file, _, err := r.FormFile("files[]")
		if err != nil {
			t.Error(err)
			return
		}
		defer file.Close()
		content, _ := io.ReadAll(file)
		if string(content) != "torrent data" {
			t.Error("file content changed")
		}
		fmt.Fprintf(w, `{"status":"success","data":{"files":[{"id":43,"hash":"%s"}]}}`, recoveryHash)
	}))
	defer server.Close()
	provider := testAllDebrid(server.URL + "/v4.1")
	torrent, err := provider.SubmitRecovery(t.Context(), &types.Torrent{InfoHash: recoveryHash, Magnet: &utils.Magnet{File: []byte("torrent data")}})
	if err != nil || torrent.Id != "43" {
		t.Fatalf("torrent=%v err=%v", torrent, err)
	}
}

func TestRecoveryObservationDoesNotRestartAndPreservesBytes(t *testing.T) {
	for _, scenario := range []struct {
		name, downloaded string
		status           int
		expected         types.TorrentStatus
	}{
		{"progress", `,"downloaded":123`, 1, types.TorrentStatusDownloading},
		{"zero", `,"downloaded":0`, 1, types.TorrentStatusDownloading},
		{"missing", "", 1, types.TorrentStatusDownloading},
		{"no peers", "", 7, types.TorrentStatusError},
		{"terminal", "", 10, types.TorrentStatusError},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/magnet/status" {
					t.Errorf("unexpected mutation %s", r.URL.Path)
				}
				fmt.Fprintf(w, `{"status":"success","data":{"magnets":[{"id":42,"hash":"%s","statusCode":%d%s}]}}`, recoveryHash, scenario.status, scenario.downloaded)
			}))
			defer server.Close()
			provider := testAllDebrid(server.URL)
			torrent, err := provider.CheckRecoveryStatus(&types.Torrent{Id: "42"})
			if err != nil || torrent.Status != scenario.expected {
				t.Fatalf("torrent=%v err=%v", torrent, err)
			}
			if (torrent.DownloadedBytes != nil) != (scenario.downloaded != "") {
				t.Fatal("missing progress became zero")
			}
		})
	}
}

func TestRecoveryCompletionLoadsFiles(t *testing.T) {
	config.SetConfigPath(t.TempDir())
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/magnet/status") {
			fmt.Fprintf(w, `{"status":"success","data":{"magnets":[{"id":42,"hash":"%s","statusCode":4}]}}`, recoveryHash)
			return
		}
		if r.URL.Path != "/v4/magnet/files" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		r.ParseForm()
		if r.Form.Get("id[]") != "42" {
			t.Error("wrong file identity")
		}
		fmt.Fprint(w, `{"status":"success","data":{"magnets":[{"id":42,"files":[{"n":"movie.mkv","s":2000000000,"l":"https://example.test/file"}]}]}}`)
	}))
	defer server.Close()
	provider := testAllDebrid(server.URL + "/v4.1")
	torrent, err := provider.CheckRecoveryStatus(&types.Torrent{Id: "42"})
	if err != nil || torrent.Status != types.TorrentStatusDownloaded || len(torrent.Files) != 1 {
		t.Fatalf("torrent=%v err=%v", torrent, err)
	}
}
