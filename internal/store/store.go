package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

type Metadata struct {
	Hidden   bool     `json:"hidden,omitempty"`
	Favorite bool     `json:"favorite,omitempty"`
	Tags     []string `json:"tags,omitempty"`
}

type diskData struct {
	Endpoints map[string]Metadata `json:"endpoints"`
	Settings  map[string]any      `json:"settings,omitempty"`
}

type Store struct {
	mu   sync.Mutex
	path string
	data diskData
}

func Load(dir string) (*Store, error) {
	store := &Store{
		path: filepath.Join(dir, "metadata.json"),
		data: diskData{Endpoints: map[string]Metadata{}, Settings: map[string]any{}},
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(store.path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return store, nil
	}
	if err := json.Unmarshal(raw, &store.data); err != nil {
		_ = os.Rename(store.path, store.path+".corrupt")
		store.data = diskData{Endpoints: map[string]Metadata{}, Settings: map[string]any{}}
		return store, nil
	}
	if store.data.Endpoints == nil {
		store.data.Endpoints = map[string]Metadata{}
	}
	if store.data.Settings == nil {
		store.data.Settings = map[string]any{}
	}
	return store, nil
}

func (s *Store) Metadata(id string) Metadata {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.Endpoints[id]
}

func (s *Store) AllMetadata() map[string]Metadata {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]Metadata, len(s.data.Endpoints))
	for key, value := range s.data.Endpoints {
		out[key] = value
	}
	return out
}

func (s *Store) SetMetadata(id string, meta Metadata) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Endpoints[id] = meta
	return s.saveLocked()
}

func (s *Store) Settings() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]any, len(s.data.Settings))
	for key, value := range s.data.Settings {
		out[key] = value
	}
	return out
}

func (s *Store) SetSettings(values map[string]any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Settings = values
	return s.saveLocked()
}

func (s *Store) saveLocked() error {
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	temp := s.path + ".tmp"
	if err := os.WriteFile(temp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, s.path)
}
