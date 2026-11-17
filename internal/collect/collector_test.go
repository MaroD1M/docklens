package collect

import (
	"context"
	"testing"
	"time"

	"github.com/MaroD1M/docklens/internal/docker"
	"github.com/MaroD1M/docklens/internal/hostinfo"
	"github.com/MaroD1M/docklens/internal/model"
)

type fakeDocker struct {
	version     docker.Version
	containers  []docker.ContainerSummary
	inspections map[string]docker.ContainerInspect
	networks    []docker.Network
}

func (f *fakeDocker) Version(context.Context) (docker.Version, error) {
	return f.version, nil
}

func (f *fakeDocker) Info(context.Context) (docker.Info, error) {
	return docker.Info{Name: "DS920+"}, nil
}

func (f *fakeDocker) Containers(context.Context) ([]docker.ContainerSummary, error) {
	return f.containers, nil
}

func (f *fakeDocker) Inspect(_ context.Context, id string) (docker.ContainerInspect, error) {
	return f.inspections[id], nil
}

func (f *fakeDocker) Networks(context.Context) ([]docker.Network, error) {
	return f.networks, nil
}

func TestScanBuildsEndpoints(t *testing.T) {
	bridge := docker.Network{ID: "net-app", Name: "app-net", Driver: "bridge", Scope: "local"}
	bridge.IPAM.Config = []docker.IPAMConfig{{Subnet: "172.18.0.0/16", Gateway: "172.18.0.1"}}
	bridge.Containers = map[string]docker.NetworkContainer{
		"c1": {Name: "jellyfin", IPv4Address: "172.18.0.5/16"},
		"c2": {Name: "postgres", IPv4Address: "172.18.0.12/16"},
	}

	jellyfin := docker.ContainerInspect{ID: "c1", Name: "/jellyfin"}
	jellyfin.State.Status = "running"
	jellyfin.State.Running = true
	jellyfin.State.StartedAt = "2026-11-16T10:00:00Z"
	jellyfin.Config.Image = "jellyfin/jellyfin:10.10"
	jellyfin.Config.Labels = map[string]string{
		"com.docker.compose.project": "media",
		"com.docker.compose.service": "jellyfin",
		"docklens.tags":              "media,family",
	}
	jellyfin.Config.ExposedPorts = map[string]map[string]any{"8096/tcp": {}}
	jellyfin.NetworkSettings.Networks = map[string]*docker.EndpointSettings{
		"app-net": {IPAddress: "172.18.0.5", Gateway: "172.18.0.1", NetworkID: "net-app"},
	}
	jellyfin.NetworkSettings.Ports = map[string][]docker.PortBinding{
		"8096/tcp": {{HostIP: "0.0.0.0", HostPort: "8096"}},
	}

	postgres := docker.ContainerInspect{ID: "c2", Name: "/postgres"}
	postgres.State.Status = "running"
	postgres.State.Running = true
	postgres.Config.Image = "postgres:16"
	postgres.Config.Labels = map[string]string{"com.docker.compose.service": "postgres", "com.docker.compose.project": "media"}
	postgres.Config.ExposedPorts = map[string]map[string]any{"5432/tcp": {}}
	postgres.NetworkSettings.Networks = map[string]*docker.EndpointSettings{
		"app-net": {IPAddress: "172.18.0.12", NetworkID: "net-app"},
	}

	hostContainer := docker.ContainerInspect{ID: "c3", Name: "/homeassistant"}
	hostContainer.State.Status = "running"
	hostContainer.State.Running = true
	hostContainer.Config.Image = "homeassistant/home-assistant:stable"
	hostContainer.Config.Labels = map[string]string{"com.docker.compose.service": "homeassistant"}
	hostContainer.Config.ExposedPorts = map[string]map[string]any{"8123/tcp": {}}
	hostContainer.HostConfig.NetworkMode = "host"

	api := &fakeDocker{
		version: docker.Version{Version: "24.0.7", APIVersion: "1.44"},
		containers: []docker.ContainerSummary{
			{ID: "c1", Names: []string{"/jellyfin"}},
			{ID: "c2", Names: []string{"/postgres"}},
			{ID: "c3", Names: []string{"/homeassistant"}},
		},
		inspections: map[string]docker.ContainerInspect{"c1": jellyfin, "c2": postgres, "c3": hostContainer},
		networks:    []docker.Network{bridge},
	}
	host := hostinfo.Info{
		Hostname:    "DS920+",
		PreferredIP: "192.168.1.20",
		Addresses: []model.AccessIP{
			{IP: "192.168.1.20", Kind: "lan", Iface: "eth0", Preferred: true},
			{IP: "100.64.0.8", Kind: "vpn", Iface: "tailscale0"},
		},
	}
	collector := New(api, host)
	collector.SetClock(func() time.Time { return time.Date(2026, 11, 16, 10, 32, 0, 0, time.Local) })

	snapshot, err := collector.Scan(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Containers) != 3 {
		t.Fatalf("expected 3 containers, got %d", len(snapshot.Containers))
	}
	if snapshot.Host.Name != "DS920+" {
		t.Fatalf("expected docker host name, got %q", snapshot.Host.Name)
	}

	var published, internal, hostNet *model.Endpoint
	for index := range snapshot.Endpoints {
		endpoint := &snapshot.Endpoints[index]
		switch {
		case endpoint.Service == "jellyfin" && endpoint.Scope == model.ScopeHost:
			published = endpoint
		case endpoint.Service == "postgres" && endpoint.Scope == model.ScopeContainer:
			internal = endpoint
		case endpoint.Service == "homeassistant" && endpoint.Scope == model.ScopeHostNet:
			hostNet = endpoint
		}
	}
	if published == nil {
		t.Fatal("missing published endpoint")
	}
	if published.Port != 8096 || published.ContainerPort != 8096 {
		t.Fatalf("unexpected published ports: %d -> %d", published.Port, published.ContainerPort)
	}
	if published.URL != "http://192.168.1.20:8096" {
		t.Fatalf("unexpected url: %s", published.URL)
	}
	if len(published.AccessIPs) != 2 || !published.AccessIPs[0].Preferred {
		t.Fatalf("unexpected access ips: %+v", published.AccessIPs)
	}
	if internal == nil || internal.IP != "172.18.0.12" || internal.Port != 5432 {
		t.Fatalf("missing internal endpoint: %+v", internal)
	}
	if hostNet == nil || hostNet.Source != model.SourceInferred || hostNet.Port != 8123 {
		t.Fatalf("missing host network endpoint: %+v", hostNet)
	}
	if len(snapshot.IPPools) == 0 {
		t.Fatal("expected ip pools")
	}
}
