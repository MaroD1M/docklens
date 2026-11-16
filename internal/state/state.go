package state

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/MaroD1M/docklens/internal/model"
	"github.com/MaroD1M/docklens/internal/store"
)

type SSEEvent struct {
	Event string
	Data  any
}

type MetaPatch struct {
	Hidden   *bool     `json:"hidden"`
	Favorite *bool     `json:"favorite"`
	Tags     *[]string `json:"tags"`
}

type State struct {
	mu            sync.RWMutex
	snapshot      *model.Snapshot
	store         *store.Store
	events        []model.Event
	firstSeen     map[string]time.Time
	ipByKey       map[string]string
	newToday      int
	ipChanges     int
	today         string
	firstScanDone bool
	subs          map[chan SSEEvent]struct{}
	lastScan      time.Time
	lastError     string
	scanning      bool
}

func New(st *store.Store) *State {
	return &State{
		snapshot: &model.Snapshot{
			ScannedAt: time.Now(),
			Host:      model.HostInfo{ID: "local", Name: "docklens-host"},
			Warnings:  []model.Warning{},
			Recent:    []model.Event{},
		},
		store:     st,
		events:    make([]model.Event, 0, 32),
		firstSeen: make(map[string]time.Time),
		ipByKey:   make(map[string]string),
		today:     time.Now().Format("2006-01-02"),
		subs:      make(map[chan SSEEvent]struct{}),
	}
}

func (s *State) SetScanError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err == nil {
		s.lastError = ""
	} else {
		s.lastError = err.Error()
	}
}

func (s *State) SetScanning(value bool) {
	s.mu.Lock()
	s.scanning = value
	s.mu.Unlock()
	s.Publish("scan.status", map[string]any{"scanning": value})
}

func (s *State) Update(snapshot *model.Snapshot) {
	s.mu.Lock()
	now := snapshot.ScannedAt
	if now.IsZero() {
		now = time.Now()
	}
	if today := now.Format("2006-01-02"); today != s.today {
		s.today = today
		s.newToday = 0
		s.ipChanges = 0
	}

	previous := make(map[string]model.Endpoint)
	previousByKey := make(map[string]model.Endpoint)
	if s.snapshot != nil {
		for _, endpoint := range s.snapshot.Endpoints {
			previous[endpoint.ID] = endpoint
			previousByKey[ipKey(endpoint)] = endpoint
		}
	}
	firstScan := !s.firstScanDone
	newEvents := make([]model.Event, 0, 8)
	seenKeys := make(map[string]bool, len(snapshot.Endpoints))

	for index := range snapshot.Endpoints {
		endpoint := &snapshot.Endpoints[index]
		meta := s.store.Metadata(endpoint.ID)
		endpoint.Hidden = meta.Hidden || endpoint.Hidden
		endpoint.Favorite = meta.Favorite || endpoint.Favorite
		if len(meta.Tags) > 0 {
			endpoint.Tags = mergeTags(endpoint.Tags, meta.Tags)
		}
		key := ipKey(*endpoint)
		seenKeys[key] = true

		if _, ok := s.firstSeen[endpoint.ID]; !ok {
			s.firstSeen[endpoint.ID] = now
			if !firstScan {
				s.newToday++
			}
		}

		if previousEndpoint, ok := previousByKey[key]; ok {
			if !sameIP(previousEndpoint.IP, endpoint.IP) && !isWildcard(previousEndpoint.IP) && !isWildcard(endpoint.IP) {
				s.ipChanges++
				newEvents = append(newEvents, model.Event{
					ID:     fmt.Sprintf("ev-ip-%d-%d", now.UnixNano(), len(newEvents)),
					At:     now.Format("15:04"),
					Time:   now,
					Type:   "changed",
					Title:  endpoint.Container + " 容器 IP 变化",
					Detail: previousEndpoint.IP + " → " + endpoint.IP + " · " + endpoint.Network,
				})
			}
		} else if _, existed := previous[endpoint.ID]; !existed && !firstScan {
			newEvents = append(newEvents, model.Event{
				ID:     fmt.Sprintf("ev-add-%d-%d", now.UnixNano(), len(newEvents)),
				At:     now.Format("15:04"),
				Time:   now,
				Type:   "added",
				Title:  endpoint.Service + " 新增端点",
				Detail: endpoint.Address() + "/" + string(endpoint.Protocol) + " · " + endpoint.Network,
			})
		}
	}

	for _, endpoint := range previous {
		if seenKeys[ipKey(endpoint)] {
			continue
		}
		if firstScan {
			continue
		}
		newEvents = append(newEvents, model.Event{
			ID:     fmt.Sprintf("ev-remove-%d-%d", now.UnixNano(), len(newEvents)),
			At:     now.Format("15:04"),
			Time:   now,
			Type:   "removed",
			Title:  endpoint.Service + " 端点消失",
			Detail: endpoint.Address() + "/" + string(endpoint.Protocol) + " · 容器重建或端口变更",
		})
	}

	if firstScan {
		newEvents = append(newEvents, model.Event{
			ID:     fmt.Sprintf("ev-first-%d-%d", now.UnixNano(), len(newEvents)),
			At:     now.Format("15:04"),
			Time:   now,
			Type:   "added",
			Title:  "首次扫描完成",
			Detail: fmt.Sprintf("发现 %d 个容器、%d 个端点", len(snapshot.Containers), len(snapshot.Endpoints)),
		})
		s.firstScanDone = true
	}

	s.snapshot = snapshot
	s.lastScan = now
	s.appendEvents(newEvents)
	s.snapshot.Recent = append([]model.Event(nil), s.events...)
	overview := s.overviewLocked()
	s.mu.Unlock()

	s.Publish("snapshot", overview)
}

func (s *State) Overview() model.Overview {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.overviewLocked()
}

func (s *State) overviewLocked() model.Overview {
	snapshot := s.snapshot
	warnings := append([]model.Warning{}, snapshot.Warnings...)
	if s.lastError != "" {
		warnings = append([]model.Warning{{
			Type:     "DOCKER_UNAVAILABLE",
			Severity: "danger",
			Title:    "Docker 不可用",
			Message:  "无法读取 Docker 数据",
			Detail:   s.lastError,
		}}, warnings...)
	}
	conflicts := 0
	for _, warning := range warnings {
		if warning.Type == "PORT_CONFLICT" {
			conflicts++
		}
	}
	favorites := make([]model.Endpoint, 0)
	for _, endpoint := range snapshot.Endpoints {
		if endpoint.Favorite {
			favorites = append(favorites, endpoint)
		}
	}
	return model.Overview{
		Host: snapshot.Host,
		Counts: model.Counts{
			Containers: len(snapshot.Containers),
			Endpoints:  len(snapshot.Endpoints),
			Networks:   len(snapshot.Networks),
			Conflicts:  conflicts,
			NewToday:   s.newToday,
			IPChanges:  s.ipChanges,
		},
		Warnings:  warnings,
		Recent:    append([]model.Event{}, s.events...),
		Favorites: favorites,
	}
}

func (s *State) SnapshotCopy() model.Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	snapshot := *s.snapshot
	snapshot.Containers = append([]model.Container(nil), s.snapshot.Containers...)
	snapshot.Networks = append([]model.Network(nil), s.snapshot.Networks...)
	snapshot.Endpoints = append([]model.Endpoint(nil), s.snapshot.Endpoints...)
	snapshot.IPPools = append([]model.IPPool(nil), s.snapshot.IPPools...)
	snapshot.Warnings = append([]model.Warning(nil), s.snapshot.Warnings...)
	snapshot.Recent = append([]model.Event(nil), s.snapshot.Recent...)
	return snapshot
}

func (s *State) Endpoint(id string) (model.Endpoint, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, endpoint := range s.snapshot.Endpoints {
		if endpoint.ID == id {
			return endpoint, true
		}
	}
	return model.Endpoint{}, false
}

func (s *State) UpdateMeta(id string, patch MetaPatch) (model.Endpoint, bool) {
	s.mu.Lock()
	var updated model.Endpoint
	found := false
	for index := range s.snapshot.Endpoints {
		endpoint := &s.snapshot.Endpoints[index]
		if endpoint.ID != id {
			continue
		}
		if patch.Hidden != nil {
			endpoint.Hidden = *patch.Hidden
		}
		if patch.Favorite != nil {
			endpoint.Favorite = *patch.Favorite
		}
		if patch.Tags != nil {
			endpoint.Tags = mergeTags(endpoint.Tags, *patch.Tags)
		}
		updated = *endpoint
		found = true
		break
	}
	if found {
		_ = s.store.SetMetadata(id, store.Metadata{
			Hidden:   updated.Hidden,
			Favorite: updated.Favorite,
			Tags:     updated.Tags,
		})
	}
	s.mu.Unlock()
	if found {
		s.Publish("endpoint.updated", updated)
	}
	return updated, found
}

func (s *State) Settings() map[string]any {
	return s.store.Settings()
}

func (s *State) SetSettings(values map[string]any) error {
	return s.store.SetSettings(values)
}

func (s *State) Subscribe() (chan SSEEvent, func()) {
	channel := make(chan SSEEvent, 8)
	s.mu.Lock()
	s.subs[channel] = struct{}{}
	s.mu.Unlock()
	cancel := func() {
		s.mu.Lock()
		delete(s.subs, channel)
		s.mu.Unlock()
	}
	return channel, cancel
}

func (s *State) Publish(event string, data any) {
	s.mu.RLock()
	subs := make([]chan SSEEvent, 0, len(s.subs))
	for channel := range s.subs {
		subs = append(subs, channel)
	}
	s.mu.RUnlock()
	for _, channel := range subs {
		select {
		case channel <- SSEEvent{Event: event, Data: data}:
		default:
		}
	}
}

func (s *State) Status() map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()
	status := map[string]any{
		"scanning": s.scanning,
		"lastScan": s.lastScan,
	}
	if s.lastError != "" {
		status["error"] = s.lastError
	}
	return status
}

func (s *State) appendEvents(events []model.Event) {
	if len(events) == 0 {
		return
	}
	sort.SliceStable(events, func(i, j int) bool { return events[i].Time.After(events[j].Time) })
	s.events = append(events, s.events...)
	if len(s.events) > 50 {
		s.events = s.events[:50]
	}
}

func ipKey(endpoint model.Endpoint) string {
	return endpoint.Container + "|" + fmt.Sprint(endpoint.ContainerPort) + "|" + string(endpoint.Protocol) + "|" + string(endpoint.Scope)
}

func sameIP(a, b string) bool {
	return a == b
}

func isWildcard(value string) bool {
	return value == "" || value == "0.0.0.0" || value == "::"
}

func mergeTags(existing, extra []string) []string {
	seen := make(map[string]bool, len(existing)+len(extra))
	out := make([]string, 0, len(existing)+len(extra))
	for _, tag := range append(append([]string{}, existing...), extra...) {
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
	}
	return out
}
