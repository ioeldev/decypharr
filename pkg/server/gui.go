package server

import (
	"html"
	"io/fs"
	"net/http"
	"strings"

	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/internal/utils"
	"github.com/sirrobot01/decypharr/web"
)

func (s *Server) serveGUI(w http.ResponseWriter, r *http.Request) {
	index, err := web.Files.ReadFile("dist/index.html")
	if err != nil {
		http.Error(w, "GUI build missing. Run bun run build before compiling Go.", http.StatusServiceUnavailable)
		return
	}

	base := s.webURL("")
	page := strings.Replace(string(index), `<base href="/" />`, `<base href="`+html.EscapeString(base)+`" />`, 1)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(page))
}

func (s *Server) guiAssets() http.Handler {
	assets, err := fs.Sub(web.Files, "dist/gui-assets")
	if err != nil {
		return http.NotFoundHandler()
	}

	return http.StripPrefix(s.webURL("gui-assets/"), http.FileServer(http.FS(assets)))
}

func (s *Server) webURL(path string) string {
	prefix := strings.Trim(s.urlBase, "/")
	if prefix == "" {
		return "/" + strings.TrimPrefix(path, "/")
	}
	return "/" + prefix + "/" + strings.TrimPrefix(path, "/")
}

func (s *Server) guiImages() http.Handler {
	images, err := fs.Sub(web.Files, "dist/images")
	if err != nil {
		return http.NotFoundHandler()
	}
	return http.StripPrefix(s.webURL("images/"), http.FileServer(http.FS(images)))
}

// getGUIState exposes only the flags needed for route selection, never credentials.
func (s *Server) getGUIState(w http.ResponseWriter, r *http.Request) {
	cfg := config.Get()
	auth := cfg.GetAuth()
	authenticated := !cfg.UseAuth || s.isValidAPIToken(r)
	if !authenticated && s.cookie != nil && auth != nil {
		session, err := s.cookie.Get(r, "auth-session")
		if err == nil {
			isAuthenticated, _ := session.Values["authenticated"].(bool)
			version, _ := session.Values["auth_version"].(string)
			authenticated = isAuthenticated && version != "" && version == auth.SessionVersion
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	utils.JSONResponse(w, map[string]bool{
		"authenticated":      authenticated,
		"needs_registration": cfg.NeedsAuth(),
		"token_only":         auth != nil && auth.TokenOnly,
		"setup_required":     cfg.SetupComplete() != nil,
	}, http.StatusOK)
}
