package collect

import (
	"fmt"
	"net"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/MaroD1M/docklens/internal/docker"
	"github.com/MaroD1M/docklens/internal/hostinfo"
	"github.com/MaroD1M/docklens/internal/hostscan"
	"github.com/MaroD1M/docklens/internal/model"
	"github.com/MaroD1M/docklens/internal/netutil"
)

var (
	portFlagPattern   = regexp.MustCompile(`(?:--port(?:=|\s+)|-p(?:=|\s+)|--listen(?:=|\s+)|--bind(?:=|\s+))([0-9]{1,5})`)
	portColonPattern  = regexp.MustCompile(`:([0-9]{1,5})(?:/|\b)`)
	healthPortPattern = regexp.MustCompile(`(?:localhost|127\.0\.0\.1):([0-9]{1,5})`)
)

func buildEndpoints(inspect docker.ContainerInspect, state *scanState) []model.Endpoint {
	if inspect.ID == "" {
		return nil
	}
	name := strings.TrimPrefix(inspect.Name, "/")
	labels := inspect.Config.Labels
	if labels == nil {
		labels = map[string]string{}
	}
	service := labels["com.docker.compose.service"]
	if service == "" {
		service = name
	}
	stack := labels["com.docker.compose.project"]
	image := inspect.Config.Image
	status := model.StatusStale
	if inspect.State.Running {
		status = model.StatusRunning
	}
	updatedAt := state.now.Format("15:04")

	baseTags := splitTags(labels["docklens.tags"])
	if stack != "" {
		baseTags = append(baseTags, stack)
	}
	baseTags = dedupeTags(baseTags)

	primaryName, primarySettings := primaryNetwork(inspect.NetworkSettings.Networks)
	primaryModel, hasPrimaryModel := state.modelNetworks[primaryName]
	networkDriver := ""
	if hasPrimaryModel {
		networkDriver = primaryModel.Driver
	}
	if networkDriver == "" {
		if raw, ok := state.networkByKey[primaryName]; ok {
			networkDriver = raw.Driver
		}
	}

	endpoints := make([]model.Endpoint, 0, len(inspect.NetworkSettings.Ports)+len(inspect.Config.ExposedPorts))
	publishedContainerPorts := make(map[string]bool)
	publishedHostPorts := make(map[string]bool)

	for spec, bindings := range inspect.NetworkSettings.Ports {
		containerPort, protocol, ok := netutil.ParsePortSpec(spec)
		if !ok {
			continue
		}
		portKey := fmt.Sprintf("%d/%s", containerPort, protocol)
		publishedContainerPorts[portKey] = true
		for _, binding := range bindings {
			hostPort, ok := netutil.PortFromString(binding.HostPort)
			if !ok {
				continue
			}
			hostIP := binding.HostIP
			if hostIP == "" {
				hostIP = "0.0.0.0"
			}
			scope := model.ScopeHost
			networkName := primaryName
			networkID := ""
			if hasPrimaryModel {
				networkID = primaryModel.ID
			}
			if (networkDriver == "macvlan" || networkDriver == "ipvlan") && primarySettings != nil && hostIP == primarySettings.IPAddress {
				scope = model.ScopeLAN
				networkName = primaryName
			}
			accessIPs := accessIPsFor(hostIP, state.host)
			urlIP := preferredAccessIP(accessIPs)
			if urlIP == "" {
				urlIP = state.host.PreferredIP
			}
			note := ""
			if netutil.IsWildcardIP(hostIP) {
				note = "绑定 0.0.0.0，访问地址来自宿主机网卡"
			} else if scope == model.ScopeLAN {
				note = "macvlan 容器，直接持有局域网 IP"
			}
			tags := append([]string{}, baseTags...)
			tags = append(tags, "published", string(protocol))
			endpoint := model.Endpoint{
				Service:       service,
				Container:     name,
				Image:         image,
				Stack:         stack,
				Scope:         scope,
				Source:        model.SourcePublished,
				Status:        status,
				IP:            hostIP,
				Port:          hostPort,
				Protocol:      protocol,
				ContainerPort: containerPort,
				Network:       networkName,
				NetworkID:     networkID,
				URL:           makeURL(urlIP, hostPort),
				Tags:          dedupeTags(tags),
				Favorite:      labels["docklens.favorite"] == "true",
				Hidden:        labels["docklens.hide"] == "true",
				Confidence:    100,
				UpdatedAt:     updatedAt,
				AccessIPs:     accessIPs,
				Note:          note,
			}
			endpoint.ID = makeEndpointID(endpoint)
			endpoints = append(endpoints, endpoint)
			publishedHostPorts[fmt.Sprintf("%d/%s", hostPort, protocol)] = true
		}
	}

	hostNetwork := inspect.HostConfig.NetworkMode == "host"
	if hostNetwork {
		inferred := inferHostNetworkPorts(inspect)
		for portKey, protocol := range inferred {
			port, _ := netutil.PortFromString(strings.SplitN(portKey, "/", 2)[0])
			if publishedHostPorts[portKey] {
				continue
			}
			accessIPs := accessIPsFor(state.host.PreferredIP, state.host)
			endpoint := model.Endpoint{
				Service:       service,
				Container:     name,
				Image:         image,
				Stack:         stack,
				Scope:         model.ScopeHostNet,
				Source:        model.SourceInferred,
				Status:        status,
				IP:            state.host.PreferredIP,
				Port:          port,
				Protocol:      protocol,
				ContainerPort: port,
				Network:       "host",
				NetworkID:     "host",
				URL:           makeURL(state.host.PreferredIP, port),
				Tags:          dedupeTags(append(append([]string{}, baseTags...), "host-net", "inferred", string(protocol))),
				Favorite:      labels["docklens.favorite"] == "true",
				Hidden:        labels["docklens.hide"] == "true",
				Confidence:    50,
				UpdatedAt:     updatedAt,
				AccessIPs:     accessIPs,
				Note:          "host 网络容器，端口从容器配置推断",
			}
			endpoint.ID = makeEndpointID(endpoint)
			endpoints = append(endpoints, endpoint)
		}
	}

	for spec := range inspect.Config.ExposedPorts {
		containerPort, protocol, ok := netutil.ParsePortSpec(spec)
		if !ok || publishedContainerPorts[fmt.Sprintf("%d/%s", containerPort, protocol)] {
			continue
		}
		if hostNetwork {
			continue
		}
		for networkName, settings := range inspect.NetworkSettings.Networks {
			if settings == nil || settings.IPAddress == "" {
				continue
			}
			networkModel, ok := state.modelNetworks[networkName]
			networkID := ""
			driver := ""
			if ok {
				networkID = networkModel.ID
				driver = networkModel.Driver
			}
			scope := model.ScopeContainer
			note := "仅容器网络内可见，未发布到宿主机"
			tags := append(append([]string{}, baseTags...), "internal", string(protocol))
			if driver == "macvlan" || driver == "ipvlan" {
				scope = model.ScopeLAN
				note = "macvlan/ipvlan 容器，直接持有局域网 IP"
				tags = append(append([]string{}, baseTags...), "lan", string(protocol))
			}
			urlValue := "http://" + net.JoinHostPort(settings.IPAddress, strconv.Itoa(containerPort))
			endpoint := model.Endpoint{
				Service:       service,
				Container:     name,
				Image:         image,
				Stack:         stack,
				Scope:         scope,
				Source:        model.SourceExposed,
				Status:        status,
				IP:            settings.IPAddress,
				Port:          containerPort,
				Protocol:      protocol,
				ContainerPort: containerPort,
				Network:       networkName,
				NetworkID:     networkID,
				URL:           urlValue,
				Tags:          dedupeTags(tags),
				Favorite:      labels["docklens.favorite"] == "true",
				Hidden:        labels["docklens.hide"] == "true" || labels["docklens.hide.internal"] == "true",
				Confidence:    80,
				UpdatedAt:     updatedAt,
				Note:          note,
			}
			endpoint.ID = makeEndpointID(endpoint)
			endpoints = append(endpoints, endpoint)
		}
	}

	return endpoints
}

func primaryNetwork(values map[string]*docker.EndpointSettings) (string, *docker.EndpointSettings) {
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if name != "host" && values[name] != nil && values[name].IPAddress != "" {
			return name, values[name]
		}
	}
	for _, name := range names {
		return name, values[name]
	}
	return "", nil
}

func accessIPsFor(bindIP string, host hostinfo.Info) []model.AccessIP {
	if netutil.IsWildcardIP(bindIP) {
		wantIPv6 := bindIP == "::"
		out := make([]model.AccessIP, 0, len(host.Addresses))
		for _, item := range host.Addresses {
			if strings.Contains(item.IP, ":") == wantIPv6 {
				out = append(out, item)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return []model.AccessIP{{IP: bindIP, Kind: classifyIP(bindIP), Preferred: true}}
}

func classifyIP(value string) string {
	ip := net.ParseIP(value)
	if ip == nil {
		return "other"
	}
	if ip.IsLoopback() {
		return "loopback"
	}
	if ip.IsPrivate() {
		return "lan"
	}
	return "public"
}

func preferredAccessIP(values []model.AccessIP) string {
	for _, value := range values {
		if value.Preferred && !strings.Contains(value.IP, ":") {
			return value.IP
		}
	}
	for _, value := range values {
		if value.Kind == "lan" && !strings.Contains(value.IP, ":") {
			return value.IP
		}
	}
	if len(values) > 0 {
		return values[0].IP
	}
	return ""
}

func makeURL(ip string, port int) string {
	if ip == "" || netutil.IsWildcardIP(ip) {
		return ""
	}
	return netutil.Scheme(port) + "://" + net.JoinHostPort(ip, strconv.Itoa(port))
}

func makeEndpointID(endpoint model.Endpoint) string {
	return netutil.StableID(
		string(endpoint.Scope),
		endpoint.IP,
		fmt.Sprint(endpoint.Port),
		string(endpoint.Protocol),
		endpoint.Container,
		fmt.Sprint(endpoint.ContainerPort),
	)
}

func inferHostNetworkPorts(inspect docker.ContainerInspect) map[string]model.Protocol {
	ports := make(map[string]model.Protocol)
	add := func(value string) {
		if port, ok := netutil.PortFromString(value); ok {
			ports[fmt.Sprintf("%d/%s", port, model.ProtocolTCP)] = model.ProtocolTCP
		}
	}
	for spec := range inspect.Config.ExposedPorts {
		port, protocol, ok := netutil.ParsePortSpec(spec)
		if ok {
			ports[fmt.Sprintf("%d/%s", port, protocol)] = protocol
		}
	}
	for _, key := range []string{"PORT", "HTTP_PORT", "HTTPS_PORT", "LISTEN_PORT", "SERVER_PORT", "WEB_PORT"} {
		for _, item := range inspect.Config.Env {
			k, v := netutil.ParseEnv(item)
			if strings.EqualFold(k, key) {
				if index := strings.LastIndex(v, ":"); index >= 0 {
					add(v[index+1:])
				} else {
					add(v)
				}
			}
		}
	}
	commands := append(append([]string{}, inspect.Config.Entrypoint...), inspect.Config.Cmd...)
	for _, command := range commands {
		for _, match := range portFlagPattern.FindAllStringSubmatch(command, -1) {
			if len(match) > 1 {
				add(match[1])
			}
		}
		for _, match := range portColonPattern.FindAllStringSubmatch(command, -1) {
			if len(match) > 1 {
				add(match[1])
			}
		}
	}
	if inspect.Config.Healthcheck != nil {
		for _, command := range inspect.Config.Healthcheck.Test {
			for _, match := range healthPortPattern.FindAllStringSubmatch(command, -1) {
				if len(match) > 1 {
					add(match[1])
				}
			}
		}
	}
	return ports
}

func splitTags(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func dedupeTags(values []string) []string {
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func hostListenerEndpoints(listeners []hostscan.Listener, state *scanState, existing []model.Endpoint) []model.Endpoint {
	covered := make(map[string]bool)
	for _, endpoint := range existing {
		if endpoint.Scope == model.ScopeHost || endpoint.Scope == model.ScopeLAN || endpoint.Scope == model.ScopeHostNet {
			covered[fmt.Sprintf("%d|%s", endpoint.Port, endpoint.Protocol)] = true
		}
	}
	out := make([]model.Endpoint, 0, len(listeners))
	for _, listener := range listeners {
		key := fmt.Sprintf("%d|%s", listener.Port, listener.Protocol)
		if covered[key] {
			continue
		}
		ip := listener.IP
		parsedIP := net.ParseIP(ip)
		if parsedIP != nil && parsedIP.IsLinkLocalUnicast() {
			continue
		}
		scope := model.ScopeHost
		accessIPs := state.host.Addresses
		urlValue := makeURL(state.host.PreferredIP, listener.Port)
		note := "来自宿主机监听，非 Docker 容器"
		if (parsedIP != nil && parsedIP.IsLoopback()) || ip == "127.0.0.1" || ip == "::1" {
			scope = model.ScopeLoopback
			accessIPs = []model.AccessIP{{IP: ip, Kind: "loopback", Preferred: true}}
			urlValue = ""
			note = "仅本机监听"
		} else if !netutil.IsWildcardIP(ip) {
			accessIPs = []model.AccessIP{{IP: ip, Kind: classifyIP(ip), Preferred: true}}
			urlValue = makeURL(ip, listener.Port)
		}
		service := listener.Process
		if service == "" {
			service = "host service"
		}
		tags := []string{"host", "listener", listener.Protocol}
		if listener.Process != "" {
			tags = append(tags, listener.Process)
		}
		endpoint := model.Endpoint{
			Service:    service,
			Container:  "—",
			Image:      "host service",
			Scope:      scope,
			Source:     model.SourceHostListener,
			Status:     model.StatusRunning,
			IP:         ip,
			Port:       listener.Port,
			Protocol:   model.Protocol(listener.Protocol),
			Network:    "host",
			NetworkID:  "host",
			URL:        urlValue,
			Tags:       dedupeTags(tags),
			Confidence: 90,
			UpdatedAt:  state.now.Format("15:04"),
			AccessIPs:  accessIPs,
			Note:       note,
		}
		endpoint.ID = makeEndpointID(endpoint)
		out = append(out, endpoint)
		covered[key] = true
	}
	return out
}
