package collect

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/MaroD1M/docklens/internal/docker"
	"github.com/MaroD1M/docklens/internal/hostinfo"
	"github.com/MaroD1M/docklens/internal/hostscan"
	"github.com/MaroD1M/docklens/internal/model"
	"github.com/MaroD1M/docklens/internal/netutil"
)

type DockerAPI interface {
	Version(ctx context.Context) (docker.Version, error)
	Info(ctx context.Context) (docker.Info, error)
	Containers(ctx context.Context) ([]docker.ContainerSummary, error)
	Inspect(ctx context.Context, id string) (docker.ContainerInspect, error)
	Networks(ctx context.Context) ([]docker.Network, error)
}

type Collector struct {
	docker   DockerAPI
	host     hostinfo.Info
	hostScan *hostscan.Scanner
	now      func() time.Time
}

func New(api DockerAPI, host hostinfo.Info) *Collector {
	return &Collector{docker: api, host: host, now: time.Now}
}

func (c *Collector) SetClock(now func() time.Time) {
	c.now = now
}

func (c *Collector) EnableHostScan(enabled bool) {
	if enabled {
		c.hostScan = hostscan.New()
		return
	}
	c.hostScan = nil
}

type scanState struct {
	host          hostinfo.Info
	networksByID  map[string]docker.Network
	networkByKey  map[string]docker.Network
	modelNetworks map[string]model.Network
	now           time.Time
}

func (c *Collector) Scan(ctx context.Context) (*model.Snapshot, error) {
	version, err := c.docker.Version(ctx)
	if err != nil {
		return nil, fmt.Errorf("docker version: %w", err)
	}
	dockerInfo, _ := c.docker.Info(ctx)

	summaries, err := c.docker.Containers(ctx)
	if err != nil {
		return nil, fmt.Errorf("docker containers: %w", err)
	}

	rawNetworks, err := c.docker.Networks(ctx)
	if err != nil {
		return nil, fmt.Errorf("docker networks: %w", err)
	}

	now := c.now()
	state := &scanState{
		host:          c.host,
		networksByID:  make(map[string]docker.Network, len(rawNetworks)),
		networkByKey:  make(map[string]docker.Network, len(rawNetworks)*2),
		modelNetworks: make(map[string]model.Network, len(rawNetworks)),
		now:           now,
	}

	byID := make(map[string]docker.ContainerSummary, len(summaries))
	for _, summary := range summaries {
		byID[summary.ID] = summary
	}

	inspected := make([]docker.ContainerInspect, len(summaries))
	inspectFailures := 0
	var failureMu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	for index, summary := range summaries {
		wg.Add(1)
		go func(index int, summary docker.ContainerSummary) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			inspect, err := c.docker.Inspect(ctx, summary.ID)
			if err != nil {
				failureMu.Lock()
				inspectFailures++
				failureMu.Unlock()
				return
			}
			inspected[index] = inspect
		}(index, summary)
	}
	wg.Wait()

	containers := make([]model.Container, 0, len(summaries))
	validInspections := make([]docker.ContainerInspect, 0, len(inspected))
	for _, inspect := range inspected {
		if inspect.ID == "" {
			continue
		}
		summary := byID[inspect.ID]
		containers = append(containers, buildContainer(summary, inspect))
		validInspections = append(validInspections, inspect)
	}

	networks, pools := buildNetworks(rawNetworks, validInspections, c.host)
	for _, network := range networks {
		state.modelNetworks[network.ID] = network
		state.modelNetworks[network.Name] = network
	}
	for _, network := range rawNetworks {
		state.networksByID[network.ID] = network
		state.networkByKey[network.Name] = network
		state.networkByKey[network.ID] = network
	}
	if _, ok := state.networkByKey["host"]; !ok {
		hostNetwork := docker.Network{ID: "host", Name: "host", Driver: "host", Scope: "local"}
		state.networkByKey["host"] = hostNetwork
		state.networksByID["host"] = hostNetwork
	}
	if hostModel, ok := state.modelNetworks["host"]; ok {
		state.modelNetworks["host"] = hostModel
	}

	endpoints := make([]model.Endpoint, 0, len(validInspections)*3)
	for _, inspect := range validInspections {
		endpoints = append(endpoints, buildEndpoints(inspect, state)...)
	}
	if c.hostScan != nil {
		if listeners, err := c.hostScan.Scan(ctx); err == nil {
			endpoints = append(endpoints, hostListenerEndpoints(listeners, state, endpoints)...)
		}
	}
	endpoints = dedupeEndpoints(endpoints)
	sortEndpoints(endpoints)

	enrichNetworkUsage(networks, endpoints, validInspections)
	pools = buildIPPools(networks)
	warnings := append(subnetWarnings(networks), portConflicts(endpoints)...)
	if inspectFailures > 0 {
		warnings = append(warnings, model.Warning{
			Type:     "INSPECT_FAILED",
			Severity: "warning",
			Title:    "部分容器读取失败",
			Message:  fmt.Sprintf("%d 个容器未能读取详细信息", inspectFailures),
			Detail:   "容器可能正在重启，或 Docker API 返回错误",
		})
	}

	endpointCounts := make(map[string]int, len(containers))
	for _, endpoint := range endpoints {
		if endpoint.Container != "" && endpoint.Container != "—" {
			endpointCounts[endpoint.Container]++
		}
	}
	for index := range containers {
		containers[index].EndpointCount = endpointCounts[containers[index].Name]
	}

	host := c.host.Model("local", version.Version, version.APIVersion)
	if dockerInfo.Name != "" {
		host.Name = dockerInfo.Name
	}
	return &model.Snapshot{
		ScannedAt:  now,
		Host:       host,
		Containers: containers,
		Networks:   networks,
		Endpoints:  endpoints,
		IPPools:    pools,
		Warnings:   warnings,
	}, nil
}

func buildContainer(summary docker.ContainerSummary, inspect docker.ContainerInspect) model.Container {
	name := strings.TrimPrefix(inspect.Name, "/")
	if name == "" && len(summary.Names) > 0 {
		name = strings.TrimPrefix(summary.Names[0], "/")
	}
	labels := inspect.Config.Labels
	if labels == nil {
		labels = summary.Labels
	}
	service := labels["com.docker.compose.service"]
	if service == "" {
		service = name
	}
	stack := labels["com.docker.compose.project"]
	image := inspect.Config.Image
	if image == "" {
		image = summary.Image
	}
	state := inspect.State.Status
	if state == "" {
		state = summary.State
	}
	statusText := summary.Status
	if statusText == "" {
		statusText = state
	}
	startedAt := inspect.State.StartedAt
	if parsed, err := time.Parse(time.RFC3339Nano, startedAt); err == nil {
		startedAt = parsed.Local().Format("2006-01-02 15:04")
	}

	networks := make([]model.ContainerNetwork, 0, len(inspect.NetworkSettings.Networks))
	for networkName, endpoint := range inspect.NetworkSettings.Networks {
		if endpoint == nil {
			continue
		}
		networks = append(networks, model.ContainerNetwork{
			Name:    networkName,
			IP:      endpoint.IPAddress,
			IPv6:    endpoint.GlobalIPv6Address,
			Gateway: endpoint.Gateway,
			MAC:     endpoint.MacAddress,
		})
	}
	sort.Slice(networks, func(i, j int) bool { return networks[i].Name < networks[j].Name })
	if len(networks) == 0 && inspect.HostConfig.NetworkMode == "host" {
		networks = append(networks, model.ContainerNetwork{Name: "host", IP: "127.0.0.1"})
	}

	return model.Container{
		ID:           inspect.ID,
		Name:         name,
		Service:      service,
		Image:        image,
		Stack:        stack,
		State:        state,
		StatusText:   statusText,
		StartedAt:    startedAt,
		RestartCount: inspect.State.RestartCount,
		Networks:     networks,
		Color:        colorFor(name),
	}
}

func sortEndpoints(endpoints []model.Endpoint) {
	sort.SliceStable(endpoints, func(i, j int) bool {
		if endpoints[i].Service == endpoints[j].Service {
			return endpoints[i].Port < endpoints[j].Port
		}
		return endpoints[i].Service < endpoints[j].Service
	})
}

func dedupeEndpoints(endpoints []model.Endpoint) []model.Endpoint {
	seen := make(map[string]int, len(endpoints))
	out := make([]model.Endpoint, 0, len(endpoints))
	for _, endpoint := range endpoints {
		key := endpointKey(endpoint)
		if index, ok := seen[key]; ok {
			existing := &out[index]
			if endpoint.Confidence > existing.Confidence {
				existing.Source = endpoint.Source
				existing.Confidence = endpoint.Confidence
			}
			if existing.Note == "" {
				existing.Note = endpoint.Note
			}
			continue
		}
		seen[key] = len(out)
		out = append(out, endpoint)
	}
	return out
}

func endpointKey(endpoint model.Endpoint) string {
	return netutil.StableID(
		string(endpoint.Scope),
		endpoint.IP,
		fmt.Sprint(endpoint.Port),
		string(endpoint.Protocol),
		endpoint.Container,
		fmt.Sprint(endpoint.ContainerPort),
	)
}

func colorFor(name string) string {
	palette := []string{"#38E8FF", "#4F7CFF", "#3BF0B0", "#FFB84D", "#A78BFA", "#FF5C7A", "#8FA6BF"}
	index := 0
	for _, r := range name {
		index = (index*31 + int(r)) % len(palette)
	}
	return palette[index]
}
