package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type GigPack struct {
	Version int        `json:"version"`
	Setlist GigSetlist `json:"setlist"`
	Songs   []GigSong  `json:"songs"`
}

type GigSetlist struct {
	ID         string        `json:"id"`
	GigName    string        `json:"gigName"`
	SongIDs    []string      `json:"songIds"`
	Categories []GigCategory `json:"categories"`
	IsActive   bool          `json:"isActive"`
}

type GigCategory struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	SongIDs []string `json:"songIds"`
}

type GigSong struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Artist        string `json:"artist"`
	DefaultKey    string `json:"defaultKey"`
	BPM           int    `json:"bpm"`
	TimeSignature string `json:"timeSignature"`
	Content       string `json:"content"`
}

type gigPackStore struct {
	mu   sync.RWMutex
	path string
	pack *GigPack
}

func newGigPackStore(path string) (*gigPackStore, error) {
	store := &gigPackStore{path: path}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read gig pack: %w", err)
	}
	var pack GigPack
	if err := json.Unmarshal(data, &pack); err != nil {
		return nil, fmt.Errorf("decode gig pack: %w", err)
	}
	normalized, err := normalizeGigPack(pack)
	if err != nil {
		return nil, fmt.Errorf("validate gig pack: %w", err)
	}
	store.pack = &normalized
	return store, nil
}

func (s *gigPackStore) Get() (GigPack, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.pack == nil {
		return GigPack{}, false
	}
	return *s.pack, true
}

func (s *gigPackStore) Save(pack GigPack) (GigPack, error) {
	normalized, err := normalizeGigPack(pack)
	if err != nil {
		return GigPack{}, err
	}
	data, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return GigPack{}, fmt.Errorf("encode gig pack: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return GigPack{}, fmt.Errorf("create gig pack directory: %w", err)
	}
	tempFile, err := os.CreateTemp(filepath.Dir(s.path), ".gig-pack-*.tmp")
	if err != nil {
		return GigPack{}, fmt.Errorf("create temporary gig pack: %w", err)
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)
	if _, err := tempFile.Write(data); err != nil {
		tempFile.Close()
		return GigPack{}, fmt.Errorf("write temporary gig pack: %w", err)
	}
	if err := tempFile.Sync(); err != nil {
		tempFile.Close()
		return GigPack{}, fmt.Errorf("sync temporary gig pack: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		return GigPack{}, fmt.Errorf("close temporary gig pack: %w", err)
	}
	if err := os.Rename(tempPath, s.path); err != nil {
		return GigPack{}, fmt.Errorf("replace gig pack: %w", err)
	}
	s.mu.Lock()
	s.pack = &normalized
	s.mu.Unlock()
	return normalized, nil
}

func normalizeGigPack(pack GigPack) (GigPack, error) {
	if pack.Setlist.ID == "" {
		return GigPack{}, errors.New("setlist id is required")
	}
	if pack.Version == 0 {
		pack.Version = 1
	}
	songsByID := make(map[string]struct{}, len(pack.Songs))
	for _, song := range pack.Songs {
		if song.ID == "" {
			return GigPack{}, errors.New("every song must have an id")
		}
		if _, exists := songsByID[song.ID]; exists {
			return GigPack{}, fmt.Errorf("duplicate song id %q", song.ID)
		}
		songsByID[song.ID] = struct{}{}
	}

	orderedIDs := make([]string, 0)
	seenIDs := make(map[string]struct{})
	for categoryIndex := range pack.Setlist.Categories {
		category := &pack.Setlist.Categories[categoryIndex]
		if category.ID == "" {
			category.ID = fmt.Sprintf("category-%d", categoryIndex+1)
		}
		for _, songID := range category.SongIDs {
			if _, exists := songsByID[songID]; !exists {
				return GigPack{}, fmt.Errorf("category %q references missing song %q", category.Name, songID)
			}
			if _, exists := seenIDs[songID]; !exists {
				orderedIDs = append(orderedIDs, songID)
				seenIDs[songID] = struct{}{}
			}
		}
	}
	if len(pack.Setlist.SongIDs) == 0 {
		pack.Setlist.SongIDs = orderedIDs
	} else {
		for _, songID := range pack.Setlist.SongIDs {
			if _, exists := songsByID[songID]; !exists {
				return GigPack{}, fmt.Errorf("setlist references missing song %q", songID)
			}
		}
	}
	return pack, nil
}
