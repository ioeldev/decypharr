package server

import (
	"context"
	"net/http"
	"strconv"
	"time"

	json "github.com/bytedance/sonic"
	"github.com/go-chi/chi/v5"
	"github.com/sirrobot01/decypharr/internal/config"
	"github.com/sirrobot01/decypharr/internal/utils"
	"github.com/sirrobot01/decypharr/pkg/arr/reacquire"
)

func (s *Server) handleLibraryIncidents(w http.ResponseWriter, r *http.Request) {
	repair := s.manager.Repair()
	recovery := s.manager.ArrService()
	if repair == nil || recovery == nil {
		http.Error(w, "Library repair is unavailable", 503)
		return
	}
	incidents, err := repair.LibraryIncidents()
	if err != nil {
		http.Error(w, "Could not load library findings", 500)
		return
	}
	jobs := make([]reacquire.Job, 0)
	for _, j := range recovery.Jobs() {
		if j.Cause == reacquire.CauseRepair {
			jobs = append(jobs, j)
		}
	}
	policy, err := config.Get().Repair.QueuePolicy()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	utils.JSONResponse(w, map[string]any{"incidents": incidents, "jobs": jobs, "queue": recovery.RepairQueueStatus(), "maxRetries": len(policy.RetryDelays)}, http.StatusOK)
}

func (s *Server) handleRetryRecoveryJob(w http.ResponseWriter, r *http.Request) {
	service := s.manager.ArrService()
	if service == nil {
		http.Error(w, "Recovery unavailable", 503)
		return
	}
	job, err := service.RetryJob(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	utils.JSONResponse(w, job, http.StatusAccepted)
}
func (s *Server) handlePauseRecoveryJob(w http.ResponseWriter, r *http.Request) {
	service := s.manager.ArrService()
	if service == nil {
		http.Error(w, "Recovery unavailable", 503)
		return
	}
	var body struct {
		Paused *bool `json:"paused"`
	}
	if err := json.ConfigDefault.NewDecoder(r.Body).Decode(&body); err != nil || body.Paused == nil {
		http.Error(w, "paused is required", 400)
		return
	}
	job, err := service.PauseJob(chi.URLParam(r, "id"), *body.Paused)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	utils.JSONResponse(w, job, http.StatusOK)
}
func (s *Server) handleLibraryIncidentAction(w http.ResponseWriter, r *http.Request) {
	repair := s.manager.Repair()
	if repair == nil {
		http.Error(w, "Library repair unavailable", 503)
		return
	}
	var body struct {
		Name   string `json:"name"`
		Action string `json:"action"`
	}
	if err := json.ConfigDefault.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		http.Error(w, "name and action are required", 400)
		return
	}
	h, err := s.manager.Storage().GetEntryHealth(body.Name)
	if err != nil || h.LibraryFile == nil {
		http.Error(w, "Library finding not found", 404)
		return
	}
	switch body.Action {
	case "pause", "resume":
		if err := repair.PauseLibraryIncident(body.Name, body.Action == "pause"); err != nil {
			http.Error(w, err.Error(), 409)
			return
		}
	case "recheck":
		if _, err := repair.RecheckEntry(s.manager.Context(), body.Name, false); err != nil {
			http.Error(w, err.Error(), 409)
			return
		}
	case "repair":
		if _, err := repair.FixBroken(s.manager.Context(), []string{body.Name}); err != nil {
			http.Error(w, err.Error(), 409)
			return
		}
	default:
		http.Error(w, "Unknown action", 400)
		return
	}
	utils.JSONResponse(w, map[string]string{"status": "accepted"}, http.StatusAccepted)
}
func (s *Server) handleLibraryMediaLink(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.URL.Query().Get("media"))
	if err != nil || id <= 0 {
		http.Error(w, "Invalid media ID", 400)
		return
	}
	service := s.manager.Arr()
	if service == nil {
		http.Error(w, "Arr unavailable", 503)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	target, err := service.MediaURL(ctx, r.URL.Query().Get("arr"), id)
	if err != nil {
		http.Error(w, "Could not open media in Arr. Check the Arr connection and Browser URL settings.", http.StatusBadGateway)
		return
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}

// Metadata is loaded separately from job polling, only for visible media.
func (s *Server) handleArrMediaDetails(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.URL.Query().Get("media"))
	if err != nil || id <= 0 {
		http.Error(w, "Invalid media ID", 400)
		return
	}
	service := s.manager.Arr()
	if service == nil {
		http.Error(w, "Arr unavailable", 503)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	details, err := service.MediaDisplayDetails(ctx, r.URL.Query().Get("arr"), r.URL.Query().Get("fingerprint"), id)
	if err != nil {
		http.Error(w, "Media details unavailable", http.StatusBadGateway)
		return
	}
	utils.JSONResponse(w, details, http.StatusOK)
}
