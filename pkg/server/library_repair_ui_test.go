package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/sirrobot01/decypharr/internal/config"
)

func TestGUIPagesSupportDirectNavigation(t *testing.T) {
	config.Reset()
	config.SetConfigPath(t.TempDir())
	t.Cleanup(config.Reset)
	cfg := config.Get()
	cfg.UseAuth = false
	cfg.DownloadFolder = t.TempDir()
	cfg.Debrids = []config.Debrid{{Name: "realdebrid", APIKey: "private-provider-key"}}
	server := newTestServer(t)
	server.urlBase = "/base/"
	router := chi.NewRouter()
	router.Mount("/base", server.WebRoutes())

	for _, path := range []string{"/", "/download", "/browse", "/repair", "/repair/library", "/repair/reacquire", "/settings", "/stats"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/base"+path, nil))
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `<base href="/base/" />`) || !strings.Contains(response.Body.String(), `id="root"`) {
			t.Fatalf("%s did not serve the React entry point: %d %s", path, response.Code, response.Body.String())
		}
	}
	state := httptest.NewRecorder()
	router.ServeHTTP(state, httptest.NewRequest(http.MethodGet, "/base/api/ui", nil))
	var flags map[string]bool
	if err := json.Unmarshal(state.Body.Bytes(), &flags); err != nil {
		t.Fatal(err)
	}
	if state.Code != http.StatusOK || !flags["authenticated"] || len(flags) != 4 {
		t.Fatalf("unexpected GUI bootstrap response: %d %s", state.Code, state.Body.String())
	}
	missing := httptest.NewRecorder()
	router.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/base/api/does-not-exist", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("unknown API returned %d instead of 404", missing.Code)
	}
}
