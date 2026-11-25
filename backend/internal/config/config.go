package config

import (
	"errors"
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	MongoURI      string
	MongoUsername string
	MongoPassword string
	MongoDatabase string
	ServerPort    string
	AdminUsername string
	AdminPasscode string
	AdminPIN      string
	JWTSecret     string
}

func Load() (Config, error) {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return Config{}, fmt.Errorf("load .env: %w", err)
	}

	cfg := Config{
		MongoURI:      os.Getenv("MONGODB_URI"),
		MongoUsername: os.Getenv("MONGODB_USERNAME"),
		MongoPassword: os.Getenv("MONGODB_PASSWORD"),
		MongoDatabase: os.Getenv("MONGODB_DATABASE"),
		ServerPort:    os.Getenv("SERVER_PORT"),
		AdminUsername: os.Getenv("ADMIN_USERNAME"),
		AdminPasscode: os.Getenv("ADMIN_PASSCODE"),
		AdminPIN:      os.Getenv("ADMIN_PIN"),
		JWTSecret:     os.Getenv("JWT_SECRET"),
	}
	if cfg.MongoURI == "" {
		return Config{}, errors.New("MONGODB_URI is required")
	}
	if cfg.MongoDatabase == "" {
		cfg.MongoDatabase = "setlist_builder"
	}
	if cfg.ServerPort == "" {
		cfg.ServerPort = "8080"
	}
	if cfg.AdminUsername == "" {
		cfg.AdminUsername = "admin"
	}
	if cfg.AdminPasscode == "" {
		cfg.AdminPasscode = cfg.AdminPIN
	}
	if cfg.AdminPIN == "" {
		return Config{}, errors.New("ADMIN_PIN is required")
	}
	if len(cfg.AdminPIN) != 4 {
		return Config{}, errors.New("ADMIN_PIN must contain exactly 4 digits")
	}
	if cfg.JWTSecret == "" {
		return Config{}, errors.New("JWT_SECRET is required")
	}
	return cfg, nil
}
