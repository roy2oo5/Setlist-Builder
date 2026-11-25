package database

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"setlist-builder/backend/internal/config"
)

type MongoDB struct {
	Client   *mongo.Client
	Database *mongo.Database
}

func Connect(ctx context.Context, cfg config.Config) (*MongoDB, error) {
	clientOptions := options.Client().ApplyURI(cfg.MongoURI)
	if cfg.MongoUsername != "" || cfg.MongoPassword != "" {
		clientOptions.SetAuth(options.Credential{
			Username: cfg.MongoUsername,
			Password: cfg.MongoPassword,
		})
	}

	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	client, err := mongo.Connect(connectCtx, clientOptions)
	if err != nil {
		return nil, fmt.Errorf("create MongoDB client: %w", err)
	}
	if err := client.Ping(connectCtx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("ping MongoDB: %w", err)
	}
	return &MongoDB{Client: client, Database: client.Database(cfg.MongoDatabase)}, nil
}

func (db *MongoDB) Close(ctx context.Context) error {
	return db.Client.Disconnect(ctx)
}

func (db *MongoDB) EnsureCollections(ctx context.Context, adminUsername, adminPasscode string) error {
	for _, name := range []string{
		"songs",
		"chord_charts",
		"setlists",
		"setlist_entries",
		"stage_snapshots",
		"users",
		"auth_sessions",
	} {
		if err := db.createCollection(ctx, name); err != nil {
			return err
		}
	}
	if err := db.EnsureIndexes(ctx); err != nil {
		return err
	}
	if err := db.SeedAdminUser(ctx, adminUsername, adminPasscode); err != nil {
		return err
	}
	return nil
}

func (db *MongoDB) createCollection(ctx context.Context, name string) error {
	err := db.Database.CreateCollection(ctx, name)
	if err == nil {
		return nil
	}
	var commandErr mongo.CommandError
	if errors.As(err, &commandErr) && commandErr.Code == 48 {
		return nil
	}
	return fmt.Errorf("create %s collection: %w", name, err)
}

func (db *MongoDB) EnsureIndexes(ctx context.Context) error {
	_, err := db.Database.Collection("songs").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "title", Value: 1}}},
		{Keys: bson.D{{Key: "artist", Value: 1}}},
		{Keys: bson.D{{Key: "tags", Value: 1}}},
	})
	if err != nil {
		return fmt.Errorf("create song indexes: %w", err)
	}
	if _, err := db.Database.Collection("chord_charts").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "songId", Value: 1}},
		Options: options.Index().SetUnique(true),
	}); err != nil {
		return fmt.Errorf("create chord chart index: %w", err)
	}
	if _, err := db.Database.Collection("stage_snapshots").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "setlistId", Value: 1}},
		Options: options.Index().SetUnique(true),
	}); err != nil {
		return fmt.Errorf("create stage snapshot index: %w", err)
	}
	if _, err := db.Database.Collection("setlist_entries").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "setlistId", Value: 1}, {Key: "position", Value: 1}},
	}); err != nil {
		return fmt.Errorf("create setlist entry index: %w", err)
	}
	if _, err := db.Database.Collection("users").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "username", Value: 1}},
		Options: options.Index().SetUnique(true),
	}); err != nil {
		return fmt.Errorf("create user index: %w", err)
	}
	if _, err := db.Database.Collection("auth_sessions").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tokenHash", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys:    bson.D{{Key: "expiresAt", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(0),
		},
	}); err != nil {
		return fmt.Errorf("create auth session indexes: %w", err)
	}
	return nil
}
