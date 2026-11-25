package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Song struct {
	ID            primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	Title         string             `json:"title" bson:"title"`
	Artist        string             `json:"artist" bson:"artist"`
	DefaultKey    string             `json:"defaultKey" bson:"defaultKey"`
	BPM           int                `json:"bpm" bson:"bpm"`
	TimeSignature string             `json:"timeSignature" bson:"timeSignature"`
	Content       string             `json:"content" bson:"content"`
	UpdatedAt     time.Time          `json:"updatedAt" bson:"updatedAt"`
}

type ChordChart struct {
	ID        string         `json:"id" bson:"_id,omitempty"`
	SongID    string         `json:"songId" bson:"songId"`
	Key       string         `json:"key" bson:"key"`
	Sections  []ChordSection `json:"sections" bson:"sections"`
	ChordPro  string         `json:"chordPro" bson:"chordPro"`
	UpdatedAt time.Time      `json:"updatedAt" bson:"updatedAt"`
}

type ChordSection struct {
	Name  string      `json:"name" bson:"name"`
	Lines []ChordLine `json:"lines" bson:"lines"`
}

type ChordLine struct {
	Lyrics string        `json:"lyrics" bson:"lyrics"`
	Words  []ChordAnchor `json:"words" bson:"words"`
}

type ChordAnchor struct {
	Word  string `json:"word" bson:"word"`
	Chord string `json:"chord" bson:"chord"`
}

type Setlist struct {
	ID         primitive.ObjectID   `json:"id" bson:"_id,omitempty"`
	GigName    string               `json:"gigName" bson:"gigName"`
	SongIDs    []primitive.ObjectID `json:"songIds" bson:"songIds"`
	Categories []SetlistCategory    `json:"categories" bson:"categories"`
	IsActive   bool                 `json:"isActive" bson:"isActive"`
	UpdatedAt  time.Time            `json:"updatedAt" bson:"updatedAt"`
}

type SetlistCategory struct {
	ID      string               `json:"id" bson:"id"`
	Name    string               `json:"name" bson:"name"`
	SongIDs []primitive.ObjectID `json:"songIds" bson:"songIds"`
}

type SetlistEntry struct {
	ID          string `json:"id" bson:"_id,omitempty"`
	SetlistID   string `json:"setlistId" bson:"setlistId"`
	SongID      string `json:"songId" bson:"songId"`
	Section     string `json:"section" bson:"section"`
	Position    int    `json:"position" bson:"position"`
	Lead        string `json:"lead" bson:"lead"`
	Transition  string `json:"transition" bson:"transition"`
	Note        string `json:"note" bson:"note"`
	Transpose   int    `json:"transpose" bson:"transpose"`
	DurationSec int    `json:"durationSeconds" bson:"durationSeconds"`
}

type StageSnapshot struct {
	ID             string    `json:"id" bson:"_id,omitempty"`
	SetlistID      string    `json:"setlistId" bson:"setlistId"`
	CurrentEntryID string    `json:"currentEntryId" bson:"currentEntryId"`
	Mode           string    `json:"mode" bson:"mode"`
	AutoScroll     bool      `json:"autoScroll" bson:"autoScroll"`
	FontScale      float64   `json:"fontScale" bson:"fontScale"`
	UpdatedAt      time.Time `json:"updatedAt" bson:"updatedAt"`
}

type User struct {
	ID           string    `json:"id" bson:"_id,omitempty"`
	Username     string    `json:"username" bson:"username"`
	PasscodeHash string    `json:"-" bson:"passcodeHash"`
	Role         string    `json:"role" bson:"role"`
	CreatedAt    time.Time `json:"createdAt" bson:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt" bson:"updatedAt"`
}

type AuthSession struct {
	ID        string    `json:"-" bson:"_id,omitempty"`
	UserID    string    `json:"-" bson:"userId"`
	TokenHash string    `json:"-" bson:"tokenHash"`
	ExpiresAt time.Time `json:"-" bson:"expiresAt"`
	CreatedAt time.Time `json:"-" bson:"createdAt"`
}
