package database

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"setlist-builder/backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

const sessionLifetime = 24 * time.Hour

var ErrInvalidCredentials = errors.New("invalid credentials")

func (db *MongoDB) SeedAdminUser(ctx context.Context, username, passcode string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(passcode), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash admin passcode: %w", err)
	}
	now := time.Now().UTC()
	_, err = db.Database.Collection("users").UpdateOne(ctx,
		bson.M{"username": username},
		bson.M{
			"$set": bson.M{
				"username":     username,
				"passcodeHash": string(hash),
				"role":         "admin",
				"updatedAt":    now,
			},
			"$setOnInsert": bson.M{
				"_id":       newID(),
				"createdAt": now,
			},
		},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		return fmt.Errorf("seed admin user: %w", err)
	}
	return nil
}

func (db *MongoDB) AuthenticateUser(ctx context.Context, username, passcode string) (models.User, error) {
	var user models.User
	err := db.Database.Collection("users").FindOne(ctx, bson.M{"username": username}).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return models.User{}, ErrNotFound
	}
	if err != nil {
		return models.User{}, fmt.Errorf("find user: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasscodeHash), []byte(passcode)); err != nil {
		return models.User{}, ErrInvalidCredentials
	}
	return user, nil
}

func (db *MongoDB) CreateSession(ctx context.Context, userID string) (string, time.Time, error) {
	rawToken := make([]byte, 32)
	if _, err := rand.Read(rawToken); err != nil {
		return "", time.Time{}, fmt.Errorf("generate session token: %w", err)
	}
	token := hex.EncodeToString(rawToken)
	expiresAt := time.Now().UTC().Add(sessionLifetime)
	session := models.AuthSession{
		ID:        newID(),
		UserID:    userID,
		TokenHash: hashToken(token),
		ExpiresAt: expiresAt,
		CreatedAt: time.Now().UTC(),
	}
	if _, err := db.Database.Collection("auth_sessions").InsertOne(ctx, session); err != nil {
		return "", time.Time{}, fmt.Errorf("create auth session: %w", err)
	}
	return token, expiresAt, nil
}

func (db *MongoDB) GetSessionUser(ctx context.Context, token string) (models.User, error) {
	var session models.AuthSession
	err := db.Database.Collection("auth_sessions").FindOne(ctx, bson.M{
		"tokenHash": hashToken(token),
		"expiresAt": bson.M{"$gt": time.Now().UTC()},
	}).Decode(&session)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return models.User{}, ErrNotFound
	}
	if err != nil {
		return models.User{}, fmt.Errorf("find auth session: %w", err)
	}
	var user models.User
	err = db.Database.Collection("users").FindOne(ctx, bson.M{"_id": session.UserID}).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return models.User{}, ErrNotFound
	}
	if err != nil {
		return models.User{}, fmt.Errorf("find session user: %w", err)
	}
	return user, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
