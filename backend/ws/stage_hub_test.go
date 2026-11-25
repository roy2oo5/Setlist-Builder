package ws

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestStageHubSendsInitialStateAndBroadcastsLeaderChanges(t *testing.T) {
	hub := NewStageHub()
	hub.SetState(StageState{SetlistID: "setlist-a", SongID: "song-a"})
	server := httptest.NewServer(hub)
	defer server.Close()
	url := "ws" + server.URL[len("http"):]

	leader := dialStageClient(t, url)
	defer leader.Close()
	follower := dialStageClient(t, url)
	defer follower.Close()

	assertStageState(t, leader, "setlist-a", "song-a", 0)
	assertStageState(t, follower, "setlist-a", "song-a", 0)

	if err := leader.WriteJSON(map[string]any{
		"type":      "CHANGE_SONG",
		"setlistId": "setlist-a",
		"songId":    "song-b",
	}); err != nil {
		t.Fatalf("send change-song command: %v", err)
	}
	assertStageState(t, leader, "setlist-a", "song-b", 0)
	assertStageState(t, follower, "setlist-a", "song-b", 0)

	if err := leader.WriteJSON(map[string]any{"type": "TRANSPOSE", "transpose": -2}); err != nil {
		t.Fatalf("send transpose command: %v", err)
	}
	assertStageState(t, leader, "setlist-a", "song-b", -2)
	assertStageState(t, follower, "setlist-a", "song-b", -2)
}

func dialStageClient(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	connection, response, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		if response != nil {
			t.Fatalf("connect Stage Hub (HTTP %d): %v", response.StatusCode, err)
		}
		t.Fatalf("connect Stage Hub: %v", err)
	}
	return connection
}

func assertStageState(t *testing.T, connection *websocket.Conn, setlistID, songID string, transpose int) {
	t.Helper()
	if err := connection.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set websocket read deadline: %v", err)
	}
	var state StageState
	if err := connection.ReadJSON(&state); err != nil {
		t.Fatalf("read Stage Hub state: %v", err)
	}
	encoded, err := json.Marshal(state)
	if err != nil {
		t.Fatalf("marshal state for assertion: %v", err)
	}
	if state.Type != "STATE_UPDATE" || state.SetlistID != setlistID || state.SongID != songID || state.Transpose != transpose || state.UpdatedAt == 0 {
		t.Fatalf("unexpected state %s", encoded)
	}
}
