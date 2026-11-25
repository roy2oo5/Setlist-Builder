package httpapi

import (
	"encoding/json"
	"net/http"

	"setlist-builder/backend/internal/config"
	"setlist-builder/backend/internal/database"
)

func NewRouter(db *database.MongoDB, cfg config.Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", healthHandler(db))
	api := NewAPIHandler(db, cfg)
	mux.Handle("/api/", authenticationMiddleware(db, api))
	adminMux := http.NewServeMux()
	adminMux.HandleFunc("POST /api/admin/login", adminLoginHandler(cfg))
	registerAdminRoutes(adminMux, db)
	mux.Handle("/api/admin/login", corsMiddleware(adminMux))
	mux.Handle("/api/admin/", requireAdmin(cfg, corsMiddleware(adminMux)))
	return corsMiddleware(mux)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func healthHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := db.Client.Ping(r.Context(), nil)
		status := http.StatusOK
		response := map[string]string{"status": "ok", "database": "connected"}
		if err != nil {
			status = http.StatusServiceUnavailable
			response = map[string]string{"status": "error", "database": "unavailable"}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		if encodeErr := json.NewEncoder(w).Encode(response); encodeErr != nil {
			http.Error(w, "encode health response", http.StatusInternalServerError)
		}
	}
}
