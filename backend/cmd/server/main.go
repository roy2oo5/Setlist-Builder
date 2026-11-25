package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"setlist-builder/backend/internal/config"
	"setlist-builder/backend/internal/database"
	"setlist-builder/backend/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}

	db, err := database.Connect(context.Background(), cfg)
	if err != nil {
		log.Fatalf("connect to MongoDB: %v", err)
	}
	if err := db.EnsureCollections(context.Background(), cfg.AdminUsername, cfg.AdminPasscode); err != nil {
		log.Fatalf("initialize MongoDB collections: %v", err)
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := db.Close(closeCtx); err != nil {
			log.Printf("close MongoDB connection: %v", err)
		}
	}()

	server := &http.Server{
		Addr:              ":" + cfg.ServerPort,
		Handler:           httpapi.NewRouter(db, cfg),
		ReadHeaderTimeout: 5 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("API listening on http://localhost:%s", cfg.ServerPort)
		serverErrors <- server.ListenAndServe()
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("HTTP server: %v", err)
		}
	case <-shutdown:
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("HTTP server shutdown: %v", err)
		}
	}
}
