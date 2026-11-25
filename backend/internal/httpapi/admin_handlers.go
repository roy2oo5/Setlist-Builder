package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"setlist-builder/backend/internal/database"
	"setlist-builder/backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func registerAdminRoutes(mux *http.ServeMux, db *database.MongoDB) {
	mux.HandleFunc("GET /api/admin/scales", func(w http.ResponseWriter, r *http.Request) {
		data, err := os.ReadFile("scales_chords.json")
		if err != nil {
			writeError(w, http.StatusNotFound, errors.New("scales and chords catalog not found"))
			return
		}
		var catalog any
		if err := json.Unmarshal(data, &catalog); err != nil {
			writeError(w, http.StatusInternalServerError, errors.New("invalid scales and chords catalog"))
			return
		}
		writeJSON(w, http.StatusOK, catalog)
	})
	mux.HandleFunc("GET /api/admin/songs", func(w http.ResponseWriter, r *http.Request) {
		filter := bson.M{}
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		key := strings.TrimSpace(r.URL.Query().Get("key"))
		conditions := bson.A{}
		if query != "" {
			conditions = append(conditions, bson.M{"$or": bson.A{
				bson.M{"title": bson.M{"$regex": query, "$options": "i"}},
				bson.M{"artist": bson.M{"$regex": query, "$options": "i"}},
			}})
		}
		if key != "" && key != "All" {
			conditions = append(conditions, bson.M{"defaultKey": key})
		}
		if len(conditions) > 0 {
			filter["$and"] = conditions
		}
		cursor, err := db.Database.Collection("songs").Find(r.Context(), filter,
			options.Find().SetSort(bson.D{{Key: "title", Value: 1}}))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		defer cursor.Close(r.Context())
		var songs []models.Song
		if err := cursor.All(r.Context(), &songs); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, songs)
	})

	mux.HandleFunc("GET /api/admin/songs/{id}", func(w http.ResponseWriter, r *http.Request) {
		song, err := findAdminSong(r.Context(), db, r.PathValue("id"))
		if err != nil {
			writeAdminSongError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, song)
	})

	mux.HandleFunc("POST /api/admin/songs", func(w http.ResponseWriter, r *http.Request) {
		var input models.Song
		if err := decodeJSON(r, &input); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		if strings.TrimSpace(input.Title) == "" {
			writeError(w, http.StatusBadRequest, errors.New("title is required"))
			return
		}
		input.ID = primitive.NewObjectID()
		input.UpdatedAt = time.Now().UTC()
		if _, err := db.Database.Collection("songs").InsertOne(r.Context(), input); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusCreated, input)
	})

	mux.HandleFunc("PUT /api/admin/songs/{id}", func(w http.ResponseWriter, r *http.Request) {
		objectID, err := primitive.ObjectIDFromHex(r.PathValue("id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, errors.New("invalid song id"))
			return
		}
		var input models.Song
		if err := decodeJSON(r, &input); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		if strings.TrimSpace(input.Title) == "" || strings.TrimSpace(input.Content) == "" {
			writeError(w, http.StatusBadRequest, errors.New("title and content are required"))
			return
		}
		update := bson.M{"$set": bson.M{
			"title": input.Title, "artist": input.Artist, "defaultKey": input.DefaultKey,
			"bpm": input.BPM, "timeSignature": input.TimeSignature,
			"content": input.Content, "updatedAt": time.Now().UTC(),
		}}
		result, err := db.Database.Collection("songs").UpdateOne(r.Context(), bson.M{"_id": objectID}, update)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if result.MatchedCount == 0 {
			writeError(w, http.StatusNotFound, database.ErrNotFound)
			return
		}
		input.ID = objectID
		input.UpdatedAt = time.Now().UTC()
		writeJSON(w, http.StatusOK, input)
	})

	mux.HandleFunc("DELETE /api/admin/songs/{id}", func(w http.ResponseWriter, r *http.Request) {
		objectID, err := primitive.ObjectIDFromHex(r.PathValue("id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, errors.New("invalid song id"))
			return
		}
		result, err := db.Database.Collection("songs").DeleteOne(r.Context(), bson.M{"_id": objectID})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if result.DeletedCount == 0 {
			writeError(w, http.StatusNotFound, database.ErrNotFound)
			return
		}
		if _, err := db.Database.Collection("setlists").UpdateMany(r.Context(),
			bson.M{"songIds": objectID},
			bson.M{"$pull": bson.M{"songIds": objectID}}); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /api/admin/setlists", func(w http.ResponseWriter, r *http.Request) {
		cursor, err := db.Database.Collection("setlists").Find(r.Context(), bson.M{},
			options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		defer cursor.Close(r.Context())
		var setlists []models.Setlist
		if err := cursor.All(r.Context(), &setlists); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, setlists)
	})

	mux.HandleFunc("POST /api/admin/setlists", func(w http.ResponseWriter, r *http.Request) {
		var input models.Setlist
		if err := decodeJSON(r, &input); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		input.UpdatedAt = time.Now().UTC()
		if input.ID.IsZero() {
			input.ID = primitive.NewObjectID()
			if _, err := db.Database.Collection("setlists").InsertOne(r.Context(), input); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			writeJSON(w, http.StatusCreated, input)
			return
		}
		result, err := db.Database.Collection("setlists").ReplaceOne(r.Context(),
			bson.M{"_id": input.ID}, input, options.Replace().SetUpsert(true))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		status := http.StatusOK
		if result.UpsertedCount > 0 {
			status = http.StatusCreated
		}
		writeJSON(w, status, input)
	})

	mux.HandleFunc("GET /api/admin/fetch-lyrics", fetchLyricsHandler())
}

func findAdminSong(ctx context.Context, db *database.MongoDB, id string) (models.Song, error) {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return models.Song{}, database.ErrNotFound
	}
	var song models.Song
	err = db.Database.Collection("songs").FindOne(ctx, bson.M{"_id": objectID}).Decode(&song)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return models.Song{}, database.ErrNotFound
	}
	return song, err
}

func writeAdminSongError(w http.ResponseWriter, err error) {
	if errors.Is(err, database.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeError(w, http.StatusInternalServerError, err)
}

func fetchLyricsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		artist := strings.TrimSpace(r.URL.Query().Get("artist"))
		title := strings.TrimSpace(r.URL.Query().Get("title"))
		if artist == "" || title == "" {
			writeError(w, http.StatusBadRequest, errors.New("artist and title are required"))
			return
		}
		client := &http.Client{Timeout: 8 * time.Second}
		lrclibURL := "https://lrclib.net/api/get?" + url.Values{
			"artist_name": {artist},
			"track_name":  {title},
		}.Encode()
		response, err := client.Get(lrclibURL)
		lyrics := ""
		if err == nil {
			defer response.Body.Close()
			if response.StatusCode == http.StatusOK {
				var payload struct {
					Artist string `json:"artistName"`
					Title  string `json:"trackName"`
					Plain  string `json:"plainLyrics"`
				}
				if json.NewDecoder(response.Body).Decode(&payload) == nil {
					lyrics = payload.Plain
					artist = firstNonEmpty(payload.Artist, artist)
					title = firstNonEmpty(payload.Title, title)
				}
			}
		}
		if strings.TrimSpace(lyrics) == "" {
			fallbackURL := fmt.Sprintf("https://api.lyrics.ovh/v1/%s/%s",
				url.PathEscape(artist), url.PathEscape(title))
			fallback, fallbackErr := client.Get(fallbackURL)
			if fallbackErr == nil {
				defer fallback.Body.Close()
				if fallback.StatusCode == http.StatusOK {
					var payload struct {
						Lyrics string `json:"lyrics"`
					}
					if json.NewDecoder(fallback.Body).Decode(&payload) == nil {
						lyrics = payload.Lyrics
					}
				}
			}
		}
		lyrics = strings.ReplaceAll(lyrics, "\r\n", "\n")
		writeJSON(w, http.StatusOK, map[string]string{"title": title, "artist": artist, "lyrics": lyrics})
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
