package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestGigPackStorePersistsAndNormalizesSongOrder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gig-pack.json")
	store, err := newGigPackStore(path)
	if err != nil {
		t.Fatalf("create gig pack store: %v", err)
	}
	input := GigPack{
		Setlist: GigSetlist{
			ID: "gig-1",
			Categories: []GigCategory{
				{ID: "cat-1", Name: "Opening", SongIDs: []string{"song-2", "song-1"}},
			},
		},
		Songs: []GigSong{{ID: "song-1", Title: "One"}, {ID: "song-2", Title: "Two"}},
	}
	saved, err := store.Save(input)
	if err != nil {
		t.Fatalf("save gig pack: %v", err)
	}
	if !reflect.DeepEqual(saved.Setlist.SongIDs, []string{"song-2", "song-1"}) {
		t.Fatalf("unexpected ordered song ids: %#v", saved.Setlist.SongIDs)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("gig-pack file not written: %v", err)
	}

	reloaded, err := newGigPackStore(path)
	if err != nil {
		t.Fatalf("reload gig pack: %v", err)
	}
	pack, ok := reloaded.Get()
	if !ok || pack.Setlist.ID != "gig-1" || len(pack.Songs) != 2 {
		t.Fatalf("unexpected reloaded pack: %#v", pack)
	}
}

func TestNormalizeGigPackRejectsUnresolvedSongs(t *testing.T) {
	_, err := normalizeGigPack(GigPack{
		Setlist: GigSetlist{
			ID:         "gig-1",
			Categories: []GigCategory{{Name: "Opening", SongIDs: []string{"missing"}}},
		},
	})
	if err == nil {
		t.Fatal("expected a missing song reference to be rejected")
	}
}
