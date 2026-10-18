package server

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/sirrobot01/decypharr/internal/config"
)

func TestGUIBuildAndAssetsUnderURLBase(t *testing.T) {
	for _, prefix := range []string{"/", "/decypharr/"} {
		t.Run(prefix, func(t *testing.T) {
			server := &Server{urlBase: prefix}
			response := httptest.NewRecorder()
			server.serveGUI(response, httptest.NewRequest(http.MethodGet, prefix, nil))
			if response.Code != http.StatusOK {
				t.Fatalf("GUI response: %d %s; build with bun run build first", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `<base href="`+prefix+`" />`) {
				t.Fatalf("GUI does not use deployment prefix %q", prefix)
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("the GUI entry point must not retain stale asset references")
			}

			asset := regexp.MustCompile(`src="\./(gui-assets/[^\"]+\.js)"`).FindStringSubmatch(response.Body.String())
			if len(asset) != 2 {
				t.Fatal("GUI entry point does not reference a compiled JavaScript asset")
			}
			assetResponse := httptest.NewRecorder()
			server.guiAssets().ServeHTTP(assetResponse, httptest.NewRequest(http.MethodGet, prefix+asset[1], nil))
			if assetResponse.Code != http.StatusOK || assetResponse.Body.Len() == 0 {
				t.Fatalf("compiled asset unavailable: %d", assetResponse.Code)
			}

			missing := httptest.NewRecorder()
			server.guiAssets().ServeHTTP(missing, httptest.NewRequest(http.MethodGet, prefix+"gui-assets/missing.js", nil))
			if missing.Code != http.StatusNotFound {
				t.Fatalf("missing asset status = %d, want 404", missing.Code)
			}
		})
	}
}

func TestGUISetupRedirectKeepsURLBaseAndAllowsAssets(t *testing.T) {
	config.Reset()
	config.SetConfigPath(t.TempDir())
	t.Cleanup(config.Reset)
	server := newTestServer(t)
	server.urlBase = "/decypharr/"
	router := chi.NewRouter()
	router.Mount("/decypharr", server.WebRoutes())

	page := httptest.NewRecorder()
	router.ServeHTTP(page, httptest.NewRequest(http.MethodGet, "/decypharr/", nil))
	if page.Code != http.StatusSeeOther || page.Header().Get("Location") != "/decypharr/setup" {
		t.Fatalf("setup redirect: %d %s", page.Code, page.Header().Get("Location"))
	}

	asset := httptest.NewRecorder()
	router.ServeHTTP(asset, httptest.NewRequest(http.MethodGet, "/decypharr/gui-assets/missing.js", nil))
	if asset.Code != http.StatusNotFound {
		t.Fatalf("asset request must reach the file server, got %d", asset.Code)
	}

	cfg := config.Get()
	cfg.UseAuth = true
	cfg.DownloadFolder = t.TempDir()
	cfg.Debrids = []config.Debrid{{Name: "realdebrid", APIKey: "key"}}
	registration := httptest.NewRecorder()
	router.ServeHTTP(registration, httptest.NewRequest(http.MethodGet, "/decypharr/", nil))
	if registration.Code != http.StatusSeeOther || registration.Header().Get("Location") != "/decypharr/register" {
		t.Fatalf("registration redirect: %d %s", registration.Code, registration.Header().Get("Location"))
	}

	api := httptest.NewRecorder()
	router.ServeHTTP(api, httptest.NewRequest(http.MethodGet, "/decypharr/api/torrents", nil))
	if api.Code != http.StatusUnauthorized || !strings.Contains(api.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("API authentication response: %d %s", api.Code, api.Body.String())
	}
}
