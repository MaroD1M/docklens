package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/MaroD1M/docklens/internal/collect"
	"github.com/MaroD1M/docklens/internal/config"
	"github.com/MaroD1M/docklens/internal/state"
	"github.com/MaroD1M/docklens/internal/version"
)

type Server struct {
	cfg       config.Config
	state     *state.State
	collector *collect.Collector
	webFS     http.FileSystem
	trigger   func()
	startedAt time.Time
}

func New(cfg config.Config, state *state.State, collector *collect.Collector, webFS http.FileSystem) *Server {
	return &Server{
		cfg:       cfg,
		state:     state,
		collector: collector,
		webFS:     webFS,
		startedAt: time.Now(),
	}
}

func (s *Server) SetTrigger(trigger func()) {
	s.trigger = trigger
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/v1/status", s.handleStatus)
	mux.HandleFunc("GET /api/v1/overview", s.handleOverview)
	mux.HandleFunc("GET /api/v1/snapshot", s.handleSnapshot)
	mux.HandleFunc("GET /api/v1/endpoints", s.handleEndpoints)
	mux.HandleFunc("PATCH /api/v1/endpoints/{id}", s.handleEndpointPatch)
	mux.HandleFunc("GET /api/v1/containers", s.handleContainers)
	mux.HandleFunc("GET /api/v1/containers/{id}", s.handleContainer)
	mux.HandleFunc("GET /api/v1/networks", s.handleNetworks)
	mux.HandleFunc("GET /api/v1/ip-pools", s.handleIPPools)
	mux.HandleFunc("GET /api/v1/topology", s.handleTopology)
	mux.HandleFunc("GET /api/v1/tools/check-port", s.handleCheckPort)
	mux.HandleFunc("GET /api/v1/tools/free-port", s.handleFreePort)
	mux.HandleFunc("GET /api/v1/export", s.handleExport)
	mux.HandleFunc("GET /api/v1/settings", s.handleGetSettings)
	mux.HandleFunc("PUT /api/v1/settings", s.handlePutSettings)
	mux.HandleFunc("GET /api/v1/auth/me", s.handleMe)
	mux.HandleFunc("GET /api/v1/events", s.handleEvents)
	mux.HandleFunc("POST /api/v1/refresh", s.handleRefresh)
	mux.HandleFunc("GET /", s.handleStatic)

	return s.middleware(mux)
}

func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("http panic", "error", recovered, "path", r.URL.Path)
				writeError(w, http.StatusInternalServerError, "INTERNAL", "服务器内部错误", "")
			}
		}()
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'")
		if s.cfg.Dev {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET,PUT,PATCH,POST,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "接口不存在", r.URL.Path)
		return
	}
	filePath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if filePath == "" || filePath == "." {
		filePath = "index.html"
	}
	if stat, err := s.webFS.Open(filePath); err == nil {
		defer stat.Close()
		if info, statErr := stat.Stat(); statErr == nil && !info.IsDir() {
			http.ServeContent(w, r, filePath, info.ModTime(), stat)
			return
		}
	}
	index, err := s.webFS.Open("index.html")
	if err != nil {
		http.Error(w, "frontend not built", http.StatusServiceUnavailable)
		return
	}
	defer index.Close()
	info, err := index.Stat()
	if err != nil {
		http.Error(w, "frontend not built", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	http.ServeContent(w, r, "index.html", info.ModTime(), index)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	status := s.state.Status()
	response := map[string]any{
		"status":    "ok",
		"uptime":    time.Since(s.startedAt).Round(time.Second).String(),
		"scannedAt": status["lastScan"],
	}
	if err, ok := status["error"]; ok {
		response["status"] = "degraded"
		response["error"] = err
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	status := s.state.Status()
	status["uptime"] = time.Since(s.startedAt).Round(time.Second).String()
	status["version"] = version.Version
	status["commit"] = version.Commit
	status["buildDate"] = version.BuildDate
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleOverview(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.state.Overview())
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.state.SnapshotCopy())
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	if s.trigger != nil {
		s.trigger()
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"id":       "local",
		"username": "admin",
		"role":     "owner",
		"local":    true,
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		slog.Error("encode json", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message, detail string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
			"detail":  detail,
		},
	})
}
