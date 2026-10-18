package server

import (
	"fmt"
	"net/http"

	json "github.com/bytedance/sonic"

	"github.com/sirrobot01/decypharr/internal/config"
)

func (s *Server) LoginHandler(w http.ResponseWriter, r *http.Request) {
	cfg := config.Get()
	if cfg.NeedsAuth() {
		http.Redirect(w, r, s.webURL("register"), http.StatusSeeOther)
		return
	}
	auth := cfg.GetAuth()
	tokenOnly := auth != nil && auth.TokenOnly

	if r.Method == http.MethodGet {
		s.serveGUI(w, r)
		return
	}

	var credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.ConfigDefault.NewDecoder(r.Body).Decode(&credentials); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	username := credentials.Username
	sessionVersion := ""
	if auth != nil {
		sessionVersion = auth.SessionVersion
	}
	ok := config.VerifyAuth(credentials.Username, credentials.Password)
	if !ok && tokenOnly {
		// Token-only mode has no password, so the API token takes its place.
		// This is the only way into the UI; without it the mode would lock the
		// user out of their own instance.
		ok = config.VerifyToken(credentials.Password)
		username = "token"
	}
	if !ok {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	session, _ := s.cookie.Get(r, "auth-session")
	session.Values["authenticated"] = true
	session.Values["username"] = username
	session.Values["auth_version"] = sessionVersion
	if err := session.Save(r, w); err != nil {
		http.Error(w, "Error saving session", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, s.webURL(""), http.StatusSeeOther)
}

func (s *Server) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	session, _ := s.cookie.Get(r, "auth-session")
	session.Values["authenticated"] = false
	session.Options.MaxAge = -1
	err := session.Save(r, w)
	if err != nil {
		return
	}
	http.Redirect(w, r, s.webURL("login"), http.StatusSeeOther)
}

func (s *Server) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	cfg := config.Get()

	// Registration exists only to set the first credential. Once auth is
	// configured — including token-only mode, which never has a password — it
	// must stay closed, or anyone could overwrite the stored credentials.
	if !cfg.NeedsAuth() {
		if r.Method == http.MethodPost {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		http.Redirect(w, r, s.webURL(""), http.StatusSeeOther)
		return
	}

	if r.Method == http.MethodGet {
		s.serveGUI(w, r)
		return
	}

	username := r.FormValue("username")
	password := r.FormValue("password")
	confirmPassword := r.FormValue("confirmPassword")

	if password != confirmPassword {
		http.Error(w, "Passwords do not match", http.StatusBadRequest)
		return
	}

	updated, err := config.Update(func(next *config.Config) error {
		if !next.NeedsAuth() {
			return fmt.Errorf("registration is closed")
		}
		return next.SetCredentials(username, password)
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Create a session
	session, _ := s.cookie.Get(r, "auth-session")
	session.Values["authenticated"] = true
	session.Values["username"] = username
	session.Values["auth_version"] = updated.GetAuth().SessionVersion
	if err := session.Save(r, w); err != nil {
		http.Error(w, "Error saving session", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, s.webURL(""), http.StatusSeeOther)
}
