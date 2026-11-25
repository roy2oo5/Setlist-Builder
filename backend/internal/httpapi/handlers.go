package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"setlist-builder/backend/internal/config"
	"setlist-builder/backend/internal/database"
	"setlist-builder/backend/internal/models"
)

func NewAPIHandler(db *database.MongoDB, cfg config.Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/unlock", unlockHandler(db, cfg))
	mux.HandleFunc("GET /api/auth/me", currentUserHandler(db))
	mux.HandleFunc("GET /api/songs", listSongsHandler(db))
	mux.HandleFunc("POST /api/songs", createSongHandler(db))
	mux.HandleFunc("GET /api/songs/{id}", getSongHandler(db))
	mux.HandleFunc("PATCH /api/songs/{id}", updateSongHandler(db))
	mux.HandleFunc("DELETE /api/songs/{id}", deleteSongHandler(db))
	mux.HandleFunc("GET /api/songs/{id}/chords", getChordChartHandler(db))
	mux.HandleFunc("PUT /api/songs/{id}/chords", saveChordChartHandler(db))
	mux.HandleFunc("GET /api/setlists", listSetlistsHandler(db))
	mux.HandleFunc("POST /api/setlists", createSetlistHandler(db))
	mux.HandleFunc("GET /api/setlists/{id}/entries", listEntriesHandler(db))
	mux.HandleFunc("POST /api/setlists/{id}/entries", addEntryHandler(db))
	mux.HandleFunc("DELETE /api/setlists/{id}/entries/{entryID}", deleteEntryHandler(db))
	mux.HandleFunc("GET /api/setlists/{id}/stage", getStageSnapshotHandler(db))
	mux.HandleFunc("PUT /api/setlists/{id}/stage", saveStageSnapshotHandler(db))
	return mux
}

func unlockHandler(db *database.MongoDB, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Passcode string `json:"passcode"`
		}
		if err := decodeJSON(r, &input); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		user, err := db.AuthenticateUser(r.Context(), cfg.AdminUsername, input.Passcode)
		if errors.Is(err, database.ErrNotFound) || errors.Is(err, database.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, errors.New("invalid passcode"))
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		token, expiresAt, err := db.CreateSession(r.Context(), user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"token":     token,
			"expiresAt": expiresAt,
			"user":      user,
		})
	}
}

func currentUserHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := userFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusUnauthorized, errors.New("authentication required"))
			return
		}
		writeJSON(w, http.StatusOK, user)
	}
}

func listSongsHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		songs, err := db.ListSongs(r.Context(), r.URL.Query().Get("q"))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, songs)
	}
}

func createSongHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var song models.Song
		if err := decodeJSON(r, &song); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		if strings.TrimSpace(song.Title) == "" || strings.TrimSpace(song.Artist) == "" {
			writeError(w, http.StatusBadRequest, errors.New("title and artist are required"))
			return
		}
		created, err := db.CreateSong(r.Context(), song)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusCreated, created)
	}
}

func getSongHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		song, err := db.GetSong(r.Context(), r.PathValue("id"))
		if errors.Is(err, database.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, song)
	}
}

func updateSongHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var song models.Song
		if err := decodeJSON(r, &song); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		updated, err := db.UpdateSong(r.Context(), r.PathValue("id"), song)
		if errors.Is(err, database.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, updated)
	}
}

func deleteSongHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := db.DeleteSong(r.Context(), r.PathValue("id"))
		if errors.Is(err, database.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func getChordChartHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		chart, err := db.GetChordChart(r.Context(), r.PathValue("id"))
		if errors.Is(err, database.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, chart)
	}
}

func saveChordChartHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var chart models.ChordChart
		if err := decodeJSON(r, &chart); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		chart.SongID = r.PathValue("id")
		saved, err := db.UpsertChordChart(r.Context(), chart)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, saved)
	}
}

func listSetlistsHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setlists, err := db.ListSetlists(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, setlists)
	}
}

func createSetlistHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var setlist models.Setlist
		if err := decodeJSON(r, &setlist); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		if strings.TrimSpace(setlist.GigName) == "" {
			writeError(w, http.StatusBadRequest, errors.New("setlist name is required"))
			return
		}
		created, err := db.CreateSetlist(r.Context(), setlist)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusCreated, created)
	}
}

func listEntriesHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		entries, err := db.GetSetlistEntries(r.Context(), r.PathValue("id"))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, entries)
	}
}

func addEntryHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var entry models.SetlistEntry
		if err := decodeJSON(r, &entry); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		entry.SetlistID = r.PathValue("id")
		if entry.SongID == "" {
			writeError(w, http.StatusBadRequest, errors.New("songId is required"))
			return
		}
		created, err := db.AddSetlistEntry(r.Context(), entry)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusCreated, created)
	}
}

func deleteEntryHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := db.DeleteSetlistEntry(r.Context(), r.PathValue("id"), r.PathValue("entryID"))
		if errors.Is(err, database.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func getStageSnapshotHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		snapshot, err := db.GetStageSnapshot(r.Context(), r.PathValue("id"))
		if errors.Is(err, database.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, snapshot)
	}
}

func saveStageSnapshotHandler(db *database.MongoDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var snapshot models.StageSnapshot
		if err := decodeJSON(r, &snapshot); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		snapshot.SetlistID = r.PathValue("id")
		saved, err := db.UpsertStageSnapshot(r.Context(), snapshot)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, saved)
	}
}
