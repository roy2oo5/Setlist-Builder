package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	stagews "setlist-builder/backend/ws"
)

//go:embed web/dist
var embeddedFrontend embed.FS

const maxGigPackBytes = 32 << 20

func main() {
	executable, err := os.Executable()
	if err != nil {
		log.Fatalf("locate stage relay binary: %v", err)
	}
	gigPackPath := os.Getenv("STAGE_GIG_PACK_PATH")
	if gigPackPath == "" {
		gigPackPath = filepath.Join(filepath.Dir(executable), "gig-pack.json")
	}
	packStore, err := newGigPackStore(gigPackPath)
	if err != nil {
		log.Fatalf("load local gig pack: %v", err)
	}
	hub := stagews.NewStageHub()
	if pack, ok := packStore.Get(); ok {
		hub.SetState(initialStageState(pack))
	}

	frontend, err := fs.Sub(embeddedFrontend, "web/dist")
	if err != nil {
		log.Fatalf("open embedded Stage View frontend: %v", err)
	}
	mux := http.NewServeMux()
	mux.Handle("/ws", hub)
	mux.HandleFunc("/api/stage/gig-pack", gigPackHandler(packStore, hub))
	mux.Handle("/", staticHandler(frontend))

	server := &http.Server{
		Addr:              "0.0.0.0:8080",
		Handler:           localCORS(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("Local Stage Relay listening on http://0.0.0.0:8080 (gig pack: %s)", gigPackPath)
		serverErrors <- server.ListenAndServe()
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("stage relay HTTP server: %v", err)
		}
	case <-shutdown:
		ctxServer, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := server.Shutdown(ctxServer); err != nil {
			log.Printf("shut down stage relay: %v", err)
		}
		cancel()
	}
}

func gigPackHandler(store *gigPackStore, hub *stagews.StageHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			pack, ok := store.Get()
			if !ok {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "no gig pack has been installed"})
				return
			}
			writeJSON(w, http.StatusOK, pack)
		case http.MethodPost:
			r.Body = http.MaxBytesReader(w, r.Body, maxGigPackBytes)
			var pack GigPack
			if err := json.NewDecoder(r.Body).Decode(&pack); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid gig pack JSON"})
				return
			}
			saved, err := store.Save(pack)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			hub.SetState(initialStageState(saved))
			writeJSON(w, http.StatusOK, saved)
		default:
			w.Header().Set("Allow", "GET, POST, OPTIONS")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		}
	}
}

func initialStageState(pack GigPack) stagews.StageState {
	songID := ""
	for _, category := range pack.Setlist.Categories {
		if len(category.SongIDs) > 0 {
			songID = category.SongIDs[0]
			break
		}
	}
	if songID == "" && len(pack.Songs) > 0 {
		songID = pack.Songs[0].ID
	}
	return stagews.StageState{
		Type:        "STATE_UPDATE",
		SetlistID:   pack.Setlist.ID,
		SongID:      songID,
		Transpose:   0,
		ScrollSpeed: 1,
		UpdatedAt:   time.Now().Unix(),
	}
}

func staticHandler(frontend fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name == "." || name == "" {
			name = "index.html"
		}
		if strings.HasPrefix(name, "api/") || name == "ws" {
			http.NotFound(w, r)
			return
		}
		data, err := fs.ReadFile(frontend, name)
		if err != nil {
			data, err = fs.ReadFile(frontend, "index.html")
			if err != nil {
				http.Error(w, "embedded frontend is unavailable", http.StatusInternalServerError)
				return
			}
			name = "index.html"
		}
		contentType := mime.TypeByExtension(filepath.Ext(name))
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		w.Header().Set("Content-Type", contentType)
		http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
	})
}

func localCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if sameOriginHost(origin, r.Host) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func sameOriginHost(origin, requestHost string) bool {
	if origin == "" {
		return false
	}
	parsed, err := url.Parse(origin)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return false
	}
	originHost := parsed.Hostname()
	requestHostname, _, err := net.SplitHostPort(requestHost)
	if err != nil {
		requestHostname = requestHost
	}
	return strings.EqualFold(originHost, requestHostname)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write JSON response: %v", err)
	}
}
