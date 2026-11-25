package ws

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 5 * time.Second
	pongWait       = 45 * time.Second
	pingPeriod     = 15 * time.Second
	maxMessageSize = 4096
)

type StageState struct {
	Type      string `json:"type"`
	SetlistID string `json:"setlistId"`
	SongID    string `json:"songId"`
	Transpose int    `json:"transpose"`
	UpdatedAt int64  `json:"updatedAt"`
}

type command struct {
	Type      string `json:"type"`
	SetlistID string `json:"setlistId"`
	SongID    string `json:"songId"`
	Transpose *int   `json:"transpose"`
}

type stageClient struct {
	connection *websocket.Conn
	outbound   chan []byte
	done       chan struct{}
}

type StageHub struct {
	mu       sync.RWMutex
	state    StageState
	clients  map[*stageClient]struct{}
	upgrader websocket.Upgrader
}

func NewStageHub() *StageHub {
	return &StageHub{
		state: StageState{
			Type:      "STATE_UPDATE",
			UpdatedAt: time.Now().Unix(),
		},
		clients: make(map[*stageClient]struct{}),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     sameHostOrigin,
		},
	}
}

func sameHostOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	return err == nil &&
		(parsed.Scheme == "http" || parsed.Scheme == "https") &&
		strings.EqualFold(parsed.Hostname(), requestHostname(r))
}

func requestHostname(r *http.Request) string {
	if hostname, _, err := net.SplitHostPort(r.Host); err == nil {
		return hostname
	}
	return r.Host
}

func (h *StageHub) Snapshot() StageState {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.state
}

func (h *StageHub) SetState(state StageState) {
	state.Type = "STATE_UPDATE"
	state.UpdatedAt = time.Now().Unix()
	h.mu.Lock()
	h.state = state
	h.broadcastLocked(state)
	h.mu.Unlock()
}

func (h *StageHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	connection, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &stageClient{
		connection: connection,
		outbound:   make(chan []byte, 8),
		done:       make(chan struct{}),
	}
	h.mu.Lock()
	h.clients[client] = struct{}{}
	initialState, marshalErr := json.Marshal(h.state)
	if marshalErr == nil {
		client.outbound <- initialState
	}
	h.mu.Unlock()
	if marshalErr != nil {
		h.removeClient(client)
		return
	}

	go client.writePump(h)
	client.readPump(h)
}

func (h *StageHub) broadcastLocked(state StageState) {
	message, err := json.Marshal(state)
	if err != nil {
		return
	}
	for client := range h.clients {
		select {
		case client.outbound <- message:
		default:
			select {
			case <-client.outbound:
			default:
			}
			select {
			case client.outbound <- message:
			default:
			}
		}
	}
}

func (h *StageHub) removeClient(client *stageClient) {
	h.mu.Lock()
	if _, exists := h.clients[client]; exists {
		delete(h.clients, client)
		close(client.done)
	}
	h.mu.Unlock()
	_ = client.connection.Close()
}

func (c *stageClient) readPump(h *StageHub) {
	defer h.removeClient(c)
	c.connection.SetReadLimit(maxMessageSize)
	_ = c.connection.SetReadDeadline(time.Now().Add(pongWait))
	c.connection.SetPongHandler(func(string) error {
		return c.connection.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, payload, err := c.connection.ReadMessage()
		if err != nil {
			return
		}
		var incoming command
		if err := json.Unmarshal(payload, &incoming); err != nil {
			continue
		}
		h.applyCommand(incoming)
	}
}

func (c *stageClient) writePump(h *StageHub) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	defer h.removeClient(c)
	for {
		select {
		case <-c.done:
			return
		case payload, ok := <-c.outbound:
			if !ok {
				_ = c.connection.WriteControl(websocket.CloseMessage, []byte{}, time.Now().Add(writeWait))
				return
			}
			_ = c.connection.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.connection.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.connection.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeWait)); err != nil {
				return
			}
		}
	}
}

func (h *StageHub) applyCommand(incoming command) {
	h.mu.Lock()
	changed := false
	switch incoming.Type {
	case "CHANGE_SONG":
		if incoming.SetlistID == "" || incoming.SongID == "" {
			h.mu.Unlock()
			return
		}
		h.state.SetlistID = incoming.SetlistID
		h.state.SongID = incoming.SongID
		changed = true
	case "TRANSPOSE":
		if incoming.Transpose == nil {
			h.mu.Unlock()
			return
		}
		h.state.Transpose = *incoming.Transpose
		changed = true
	default:
		h.mu.Unlock()
		return
	}
	if changed {
		h.state.Type = "STATE_UPDATE"
		h.state.UpdatedAt = time.Now().Unix()
	}
	state := h.state
	if changed {
		h.broadcastLocked(state)
	}
	h.mu.Unlock()
}
