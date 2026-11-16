package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
	"time"

	"github.com/MaroD1M/docklens/internal/config"
	"github.com/MaroD1M/docklens/internal/model"
	"github.com/MaroD1M/docklens/internal/state"
	"github.com/MaroD1M/docklens/internal/store"
)

func testServer(t *testing.T) (*httptest.Server, *state.State) {
	t.Helper()
	metadata, err := store.Load(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	appState := state.New(metadata)
	now := time.Date(2026, 11, 16, 10, 32, 0, 0, time.Local)
	appState.Update(&model.Snapshot{
		ScannedAt: now,
		Host:      model.HostInfo{ID: "local", Name: "DS920+", PreferredIP: "192.168.1.20"},
		Containers: []model.Container{
			{ID: "c1", Name: "jellyfin", Service: "jellyfin", State: "running"},
		},
		Networks: []model.Network{
			{ID: "net-app", Name: "app-net", Driver: "bridge", Subnet: "172.18.0.0/16", TotalCount: 65534},
		},
		Endpoints: []model.Endpoint{
			{
				ID: "ep-jellyfin", Service: "jellyfin", Container: "jellyfin", Image: "jellyfin/jellyfin",
				Scope: model.ScopeHost, Source: model.SourcePublished, Status: model.StatusRunning,
				IP: "0.0.0.0", Port: 8096, Protocol: model.ProtocolTCP, ContainerPort: 8096,
				Network: "app-net", NetworkID: "net-app", URL: "http://192.168.1.20:8096",
				Tags: []string{"media"}, Confidence: 100, UpdatedAt: "10:32",
				AccessIPs: []model.AccessIP{{IP: "192.168.1.20", Kind: "lan", Preferred: true}},
			},
			{
				ID: "ep-postgres", Service: "postgres", Container: "postgres", Image: "postgres:16",
				Scope: model.ScopeContainer, Source: model.SourceExposed, Status: model.StatusRunning,
				IP: "172.18.0.12", Port: 5432, Protocol: model.ProtocolTCP, ContainerPort: 5432,
				Network: "app-net", NetworkID: "net-app", Tags: []string{"internal"}, Confidence: 80, UpdatedAt: "10:32",
			},
		},
		IPPools: []model.IPPool{{NetworkID: "net-app", CIDR: "172.18.0.0/16", Family: 4, Used: 2}},
	})

	web := fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("<html>ok</html>")}}
	server := New(config.Config{Refresh: time.Second}, appState, nil, http.FS(web))
	httpServer := httptest.NewServer(server.Handler())
	t.Cleanup(httpServer.Close)
	return httpServer, appState
}

func getJSON(t *testing.T, url string, target any) {
	t.Helper()
	response, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status %d for %s", response.StatusCode, url)
	}
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		t.Fatal(err)
	}
}

func TestOverviewAndEndpoints(t *testing.T) {
	server, _ := testServer(t)

	var overview model.Overview
	getJSON(t, server.URL+"/api/v1/overview", &overview)
	if overview.Counts.Endpoints != 2 {
		t.Fatalf("expected 2 endpoints, got %d", overview.Counts.Endpoints)
	}

	var result struct {
		Items []model.Endpoint `json:"items"`
		Total int              `json:"total"`
	}
	getJSON(t, server.URL+"/api/v1/endpoints?q=:8096", &result)
	if result.Total != 1 || result.Items[0].Service != "jellyfin" {
		t.Fatalf("unexpected filtered endpoints: %+v", result)
	}
}

func TestCheckPortAndFreePort(t *testing.T) {
	server, _ := testServer(t)

	var check struct {
		Available bool             `json:"available"`
		Matches   []model.Endpoint `json:"matches"`
	}
	getJSON(t, server.URL+"/api/v1/tools/check-port?port=8096&proto=tcp", &check)
	if check.Available || len(check.Matches) != 1 {
		t.Fatalf("expected occupied port: %+v", check)
	}

	var free struct {
		Ports []int `json:"ports"`
	}
	getJSON(t, server.URL+"/api/v1/tools/free-port?from=8090&to=8100&count=3&proto=tcp", &free)
	if len(free.Ports) != 3 || free.Ports[0] != 8090 || free.Ports[2] != 8092 {
		t.Fatalf("unexpected free ports: %+v", free.Ports)
	}
}

func TestEndpointPatchAndHiddenFilter(t *testing.T) {
	server, _ := testServer(t)

	body, _ := json.Marshal(map[string]any{"hidden": true, "favorite": true})
	request, _ := http.NewRequest(http.MethodPatch, server.URL+"/api/v1/endpoints/ep-jellyfin", bytes.NewReader(body))
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status: %d", response.StatusCode)
	}

	var result struct {
		Items []model.Endpoint `json:"items"`
		Total int              `json:"total"`
	}
	getJSON(t, server.URL+"/api/v1/endpoints", &result)
	if result.Total != 1 {
		t.Fatalf("expected hidden endpoint excluded, got %d", result.Total)
	}
	getJSON(t, server.URL+"/api/v1/endpoints?hidden=true", &result)
	if result.Total != 1 || !result.Items[0].Favorite {
		t.Fatalf("expected hidden endpoint returned: %+v", result)
	}
}

func TestHealthAndStatic(t *testing.T) {
	server, _ := testServer(t)
	response, err := http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("unexpected health status: %d", response.StatusCode)
	}
	response, err = http.Get(server.URL + "/endpoints")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("unexpected static status: %d", response.StatusCode)
	}
}
