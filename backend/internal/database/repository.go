package database

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setlist-builder/backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var ErrNotFound = errors.New("resource not found")

func newID() string {
	return primitive.NewObjectID().Hex()
}

func (db *MongoDB) ListSongs(ctx context.Context, query string) ([]models.Song, error) {
	filter := bson.M{}
	if query != "" {
		filter = bson.M{"$or": []bson.M{
			{"title": bson.M{"$regex": query, "$options": "i"}},
			{"artist": bson.M{"$regex": query, "$options": "i"}},
		}}
	}
	cursor, err := db.Database.Collection("songs").Find(ctx, filter, nil)
	if err != nil {
		return nil, fmt.Errorf("list songs: %w", err)
	}
	defer cursor.Close(ctx)
	var songs []models.Song
	if err := cursor.All(ctx, &songs); err != nil {
		return nil, fmt.Errorf("decode songs: %w", err)
	}
	return songs, nil
}

func (db *MongoDB) CreateSong(ctx context.Context, song models.Song) (models.Song, error) {
	now := time.Now().UTC()
	song.ID, song.UpdatedAt = primitive.NewObjectID(), now
	if _, err := db.Database.Collection("songs").InsertOne(ctx, song); err != nil {
		return models.Song{}, fmt.Errorf("create song: %w", err)
	}
	return song, nil
}

func (db *MongoDB) GetSong(ctx context.Context, id string) (models.Song, error) {
	var song models.Song
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return models.Song{}, ErrNotFound
	}
	err = db.Database.Collection("songs").FindOne(ctx, bson.M{"_id": objectID}).Decode(&song)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return models.Song{}, ErrNotFound
	}
	if err != nil {
		return models.Song{}, fmt.Errorf("get song: %w", err)
	}
	return song, nil
}

func (db *MongoDB) UpdateSong(ctx context.Context, id string, song models.Song) (models.Song, error) {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return models.Song{}, ErrNotFound
	}
	song.ID, song.UpdatedAt = objectID, time.Now().UTC()
	result, err := db.Database.Collection("songs").ReplaceOne(ctx, bson.M{"_id": objectID}, song)
	if err != nil {
		return models.Song{}, fmt.Errorf("update song: %w", err)
	}
	if result.MatchedCount == 0 {
		return models.Song{}, ErrNotFound
	}
	return song, nil
}

func (db *MongoDB) DeleteSong(ctx context.Context, id string) error {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return ErrNotFound
	}
	result, err := db.Database.Collection("songs").DeleteOne(ctx, bson.M{"_id": objectID})
	if err != nil {
		return fmt.Errorf("delete song: %w", err)
	}
	if result.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func (db *MongoDB) GetChordChart(ctx context.Context, songID string) (models.ChordChart, error) {
	var chart models.ChordChart
	err := db.Database.Collection("chord_charts").FindOne(ctx, bson.M{"songId": songID}).Decode(&chart)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return models.ChordChart{}, ErrNotFound
	}
	if err != nil {
		return models.ChordChart{}, fmt.Errorf("get chord chart: %w", err)
	}
	return chart, nil
}

func (db *MongoDB) UpsertChordChart(ctx context.Context, chart models.ChordChart) (models.ChordChart, error) {
	existing, err := db.GetChordChart(ctx, chart.SongID)
	if err == nil {
		chart.ID = existing.ID
	} else if !errors.Is(err, ErrNotFound) {
		return models.ChordChart{}, err
	} else {
		chart.ID = newID()
	}
	chart.UpdatedAt = time.Now().UTC()
	opts := optionsUpsert()
	_, err = db.Database.Collection("chord_charts").ReplaceOne(ctx, bson.M{"songId": chart.SongID}, chart, opts)
	if err != nil {
		return models.ChordChart{}, fmt.Errorf("save chord chart: %w", err)
	}
	return chart, nil
}

func optionsUpsert() *options.ReplaceOptions {
	value := true
	return &options.ReplaceOptions{Upsert: &value}
}

func (db *MongoDB) ListSetlists(ctx context.Context) ([]models.Setlist, error) {
	cursor, err := db.Database.Collection("setlists").Find(ctx, bson.M{}, nil)
	if err != nil {
		return nil, fmt.Errorf("list setlists: %w", err)
	}
	defer cursor.Close(ctx)
	var setlists []models.Setlist
	if err := cursor.All(ctx, &setlists); err != nil {
		return nil, fmt.Errorf("decode setlists: %w", err)
	}
	return setlists, nil
}

func (db *MongoDB) CreateSetlist(ctx context.Context, setlist models.Setlist) (models.Setlist, error) {
	now := time.Now().UTC()
	setlist.ID, setlist.UpdatedAt = primitive.NewObjectID(), now
	if _, err := db.Database.Collection("setlists").InsertOne(ctx, setlist); err != nil {
		return models.Setlist{}, fmt.Errorf("create setlist: %w", err)
	}
	return setlist, nil
}

func (db *MongoDB) GetSetlistEntries(ctx context.Context, setlistID string) ([]models.SetlistEntry, error) {
	cursor, err := db.Database.Collection("setlist_entries").Find(ctx, bson.M{"setlistId": setlistID}, nil)
	if err != nil {
		return nil, fmt.Errorf("list setlist entries: %w", err)
	}
	defer cursor.Close(ctx)
	var entries []models.SetlistEntry
	if err := cursor.All(ctx, &entries); err != nil {
		return nil, fmt.Errorf("decode setlist entries: %w", err)
	}
	return entries, nil
}

func (db *MongoDB) AddSetlistEntry(ctx context.Context, entry models.SetlistEntry) (models.SetlistEntry, error) {
	entry.ID = newID()
	if _, err := db.Database.Collection("setlist_entries").InsertOne(ctx, entry); err != nil {
		return models.SetlistEntry{}, fmt.Errorf("add setlist entry: %w", err)
	}
	return entry, nil
}

func (db *MongoDB) DeleteSetlistEntry(ctx context.Context, setlistID, entryID string) error {
	result, err := db.Database.Collection("setlist_entries").DeleteOne(ctx, bson.M{"_id": entryID, "setlistId": setlistID})
	if err != nil {
		return fmt.Errorf("delete setlist entry: %w", err)
	}
	if result.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func (db *MongoDB) GetStageSnapshot(ctx context.Context, setlistID string) (models.StageSnapshot, error) {
	var snapshot models.StageSnapshot
	err := db.Database.Collection("stage_snapshots").FindOne(ctx, bson.M{"setlistId": setlistID}).Decode(&snapshot)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return models.StageSnapshot{}, ErrNotFound
	}
	if err != nil {
		return models.StageSnapshot{}, fmt.Errorf("get stage snapshot: %w", err)
	}
	return snapshot, nil
}

func (db *MongoDB) UpsertStageSnapshot(ctx context.Context, snapshot models.StageSnapshot) (models.StageSnapshot, error) {
	existing, err := db.GetStageSnapshot(ctx, snapshot.SetlistID)
	if err == nil {
		snapshot.ID = existing.ID
	} else if !errors.Is(err, ErrNotFound) {
		return models.StageSnapshot{}, err
	} else {
		snapshot.ID = newID()
	}
	snapshot.UpdatedAt = time.Now().UTC()
	_, err = db.Database.Collection("stage_snapshots").ReplaceOne(ctx, bson.M{"setlistId": snapshot.SetlistID}, snapshot, optionsUpsert())
	if err != nil {
		return models.StageSnapshot{}, fmt.Errorf("save stage snapshot: %w", err)
	}
	return snapshot, nil
}
