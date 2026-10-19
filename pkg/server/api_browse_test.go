package server

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/sirrobot01/decypharr/internal/config"
	debrid "github.com/sirrobot01/decypharr/pkg/debrid/common"
	"github.com/sirrobot01/decypharr/pkg/debrid/types"
	"github.com/sirrobot01/decypharr/pkg/manager"
	"github.com/sirrobot01/decypharr/pkg/storage"
)

func TestBrowseDownloadUsesBrowserRedirectAndPreservesRange(t *testing.T) {
	config.Reset()
	config.SetConfigPath(t.TempDir())
	t.Cleanup(config.Reset)

	content := "test media content"
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeContent(w, r, "movie.mkv", time.Time{}, strings.NewReader(content))
	}))
	defer provider.Close()

	mgr := manager.New()
	t.Cleanup(func() { _ = mgr.Stop() })
	downloadLink := provider.URL + "/signed/movie%20file.mkv?token=test&expires=123"
	mgr.Clients().Store("test", browseDownloadProvider{link: downloadLink})
	file := &storage.File{Name: "Movie with spaces.mkv", InfoHash: "browse-download", Size: int64(len(content))}
	entry := &storage.Entry{
		InfoHash: file.InfoHash, Name: "Movie with spaces", Protocol: config.ProtocolTorrent,
		ActiveProvider: "test", Files: map[string]*storage.File{file.Name: file},
		Providers: map[string]*storage.ProviderEntry{
			"test": {ID: "provider-id", Files: map[string]*storage.ProviderFile{file.Name: {Id: "file-id"}}},
		},
	}
	if err := mgr.Storage().AddOrUpdate(entry); err != nil {
		t.Fatal(err)
	}

	server := newTestServer(t)
	server.manager = mgr
	router := chi.NewRouter()
	router.Get("/api/browse/download/{torrent}/{file}", server.handleDownloadFile)
	path := "/api/browse/download/" + url.PathEscape(entry.GetFolder()) + "/" + url.PathEscape(file.Name)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
	if response.Code != http.StatusFound || response.Header().Get("Location") != downloadLink {
		t.Fatalf("download response = %d, location = %q", response.Code, response.Header().Get("Location"))
	}
	for _, header := range []string{"X-Accel-Redirect", "X-Accel-Buffering"} {
		if value := response.Header().Get(header); value != "" {
			t.Errorf("browser download must not send proxy-control header %s = %q", header, value)
		}
	}
	if cacheControl := response.Header().Get("Cache-Control"); cacheControl != "no-store" {
		t.Errorf("expiring download redirect must not be cached, got %q", cacheControl)
	}
	if disposition := response.Header().Get("Content-Disposition"); disposition != `attachment; filename="`+file.Name+`"` {
		t.Errorf("attachment filename = %q", disposition)
	}

	application := httptest.NewServer(router)
	defer application.Close()
	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, application.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Range", "bytes=0-3")
	download, err := application.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer download.Body.Close()
	body, err := io.ReadAll(download.Body)
	if err != nil {
		t.Fatal(err)
	}
	if download.StatusCode != http.StatusPartialContent || string(body) != content[:4] {
		t.Fatalf("download = %d %q; want 206 and the requested bytes", download.StatusCode, body)
	}
}

type browseDownloadProvider struct {
	debrid.Client
	link string
}

func (provider browseDownloadProvider) GetDownloadLink(context.Context, string, *types.File) (types.DownloadLink, error) {
	return types.DownloadLink{DownloadLink: provider.link}, nil
}
