package collect

import (
	"fmt"
	"net"
	"sort"
	"strings"

	"github.com/MaroD1M/docklens/internal/docker"
	"github.com/MaroD1M/docklens/internal/hostinfo"
	"github.com/MaroD1M/docklens/internal/model"
	"github.com/MaroD1M/docklens/internal/netutil"
)

func buildNetworks(raw []docker.Network, inspects []docker.ContainerInspect, host hostinfo.Info) ([]model.Network, []model.IPPool) {
	networks := make([]model.Network, 0, len(raw)+1)
	seenNames := make(map[string]bool, len(raw))
	for _, network := range raw {
		seenNames[network.Name] = true
		subnet, gateway, ipv6Subnet := networkIPAM(network)
		used := make([]model.IPUsage, 0, len(network.Containers)+1)
		if gateway != "" {
			used = append(used, model.IPUsage{IP: gateway, Kind: "gateway"})
		}
		for _, container := range network.Containers {
			ip := trimCIDR(container.IPv4Address)
			if ip == "" {
				continue
			}
			used = append(used, model.IPUsage{
				IP:        ip,
				Kind:      "container",
				Container: strings.TrimPrefix(container.Name, "/"),
			})
		}
		networks = append(networks, newNetworkModel(network.ID, network.Name, network.Driver, network.Scope, network.Internal, subnet, gateway, ipv6Subnet, used))
	}

	if !seenNames["host"] {
		used := make([]model.IPUsage, 0)
		if host.PreferredIP != "" {
			used = append(used, model.IPUsage{IP: host.PreferredIP, Kind: "host", Container: "宿主机"})
		}
		for _, inspect := range inspects {
			if inspect.HostConfig.NetworkMode != "host" {
				continue
			}
			name := strings.TrimPrefix(inspect.Name, "/")
			used = append(used, model.IPUsage{IP: host.PreferredIP, Kind: "container", Container: name})
		}
		subnet := ""
		gateway := ""
		if ip := net.ParseIP(host.PreferredIP); ip != nil && ip.To4() != nil {
			subnet = (&net.IPNet{IP: ip.Mask(net.CIDRMask(24, 32)), Mask: net.CIDRMask(24, 32)}).String()
			gateway = net.IPv4(ip[12], ip[13], ip[14], 1).String()
		}
		networks = append(networks, newNetworkModel("host", "host", "host", "local", false, subnet, gateway, "", used))
	} else {
		for index := range networks {
			if networks[index].Name != "host" {
				continue
			}
			if networks[index].Subnet == "" && host.PreferredIP != "" {
				if ip := net.ParseIP(host.PreferredIP); ip != nil && ip.To4() != nil {
					networks[index].Subnet = (&net.IPNet{IP: ip.Mask(net.CIDRMask(24, 32)), Mask: net.CIDRMask(24, 32)}).String()
					networks[index].Gateway = net.IPv4(ip[12], ip[13], ip[14], 1).String()
				}
			}
			if len(networks[index].UsedIPs) == 0 && host.PreferredIP != "" {
				networks[index].UsedIPs = append(networks[index].UsedIPs, model.IPUsage{IP: host.PreferredIP, Kind: "host", Container: "宿主机"})
			}
			for _, inspect := range inspects {
				if inspect.HostConfig.NetworkMode != "host" {
					continue
				}
				name := strings.TrimPrefix(inspect.Name, "/")
				networks[index].UsedIPs = append(networks[index].UsedIPs, model.IPUsage{IP: host.PreferredIP, Kind: "container", Container: name})
			}
		}
	}

	sort.Slice(networks, func(i, j int) bool { return networks[i].Name < networks[j].Name })
	return networks, buildIPPools(networks)
}

func newNetworkModel(id, name, driver, scope string, internal bool, subnet, gateway, ipv6Subnet string, used []model.IPUsage) model.Network {
	used = dedupeUsage(used)
	total := int64(0)
	if _, count, ok := netutil.CIDRInfo(subnet); ok && count != nil {
		total = *count
	}
	utilization := 0.0
	if total > 0 {
		utilization = float64(uniqueIPCount(used)) / float64(total)
	}
	return model.Network{
		ID:             id,
		Name:           name,
		Driver:         driver,
		Scope:          scope,
		Subnet:         subnet,
		Gateway:        gateway,
		IPv6Subnet:     ipv6Subnet,
		Internal:       internal,
		ContainerCount: containerCount(used),
		UsedCount:      uniqueIPCount(used),
		TotalCount:     total,
		Utilization:    utilization,
		UsedIPs:        used,
	}
}

func networkIPAM(network docker.Network) (subnet, gateway, ipv6Subnet string) {
	for _, config := range network.IPAM.Config {
		if config.Subnet == "" {
			continue
		}
		if strings.Contains(config.Subnet, ":") {
			if ipv6Subnet == "" {
				ipv6Subnet = config.Subnet
			}
			continue
		}
		if subnet == "" {
			subnet = config.Subnet
			gateway = config.Gateway
		}
	}
	return subnet, gateway, ipv6Subnet
}

func enrichNetworkUsage(networks []model.Network, endpoints []model.Endpoint, inspects []docker.ContainerInspect) {
	byName := make(map[string]*model.Network, len(networks))
	for index := range networks {
		byName[networks[index].Name] = &networks[index]
	}
	for _, endpoint := range endpoints {
		if netutil.IsWildcardIP(endpoint.IP) || endpoint.IP == "" {
			continue
		}
		networkName := endpoint.Network
		if networkName == "" {
			continue
		}
		network, ok := byName[networkName]
		if !ok {
			continue
		}
		if network.Subnet == "" || !netutil.ContainsIP(network.Subnet, endpoint.IP) {
			continue
		}
		found := false
		for _, usage := range network.UsedIPs {
			if usage.IP == endpoint.IP && usage.Container == endpoint.Container {
				found = true
				break
			}
		}
		if found {
			continue
		}
		kind := "container"
		if endpoint.Scope == model.ScopeHostNet {
			kind = "host"
		}
		network.UsedIPs = append(network.UsedIPs, model.IPUsage{
			IP:        endpoint.IP,
			Kind:      kind,
			Container: endpoint.Container,
		})
	}
	for index := range networks {
		network := &networks[index]
		network.UsedIPs = dedupeUsage(network.UsedIPs)
		network.UsedCount = uniqueIPCount(network.UsedIPs)
		if network.TotalCount > 0 {
			network.Utilization = float64(network.UsedCount) / float64(network.TotalCount)
		}
	}
	_ = inspects
}

func buildIPPools(networks []model.Network) []model.IPPool {
	pools := make([]model.IPPool, 0, len(networks)*2)
	for _, network := range networks {
		if network.Subnet != "" {
			family, total, ok := netutil.CIDRInfo(network.Subnet)
			if ok {
				used := uniqueIPCount(network.UsedIPs)
				var free *int64
				var utilization *float64
				if total != nil {
					value := *total - int64(used)
					if value < 0 {
						value = 0
					}
					free = &value
					ratio := 0.0
					if *total > 0 {
						ratio = float64(used) / float64(*total)
					}
					utilization = &ratio
				}
				pools = append(pools, model.IPPool{
					NetworkID:   network.ID,
					CIDR:        network.Subnet,
					Family:      family,
					Gateway:     network.Gateway,
					Total:       total,
					Used:        used,
					Free:        free,
					UsedIPs:     network.UsedIPs,
					Utilization: utilization,
				})
			}
		}
	}
	return pools
}

func subnetWarnings(networks []model.Network) []model.Warning {
	warnings := make([]model.Warning, 0)
	seen := make(map[string]bool)
	for i := 0; i < len(networks); i++ {
		for j := i + 1; j < len(networks); j++ {
			a := networks[i]
			b := networks[j]
			if a.Subnet == "" || b.Subnet == "" || a.Name == "host" || b.Name == "host" {
				continue
			}
			if !netutil.CIDROverlap(a.Subnet, b.Subnet) {
				continue
			}
			key := a.Name + "|" + b.Name
			if seen[key] {
				continue
			}
			seen[key] = true
			message := fmt.Sprintf("%s 与 %s 的 %s 子网重叠", a.Name, b.Name, b.Subnet)
			warnings = append(warnings, model.Warning{
				Type:     "SUBNET_OVERLAP",
				Severity: "danger",
				Title:    "子网重叠",
				Message:  message,
				Detail:   "受影响 CIDR " + a.Subnet + "、 " + b.Subnet,
			})
			networks[i].Warning = "与 " + b.Name + " 的 " + b.Subnet + " 子网重叠"
			networks[j].Warning = "与 " + a.Name + " 的 " + a.Subnet + " 子网重叠"
		}
	}
	return warnings
}

func portConflicts(endpoints []model.Endpoint) []model.Warning {
	groups := make(map[string][]model.Endpoint)
	for _, endpoint := range endpoints {
		if endpoint.Status != model.StatusRunning {
			continue
		}
		if endpoint.Scope != model.ScopeHost && endpoint.Scope != model.ScopeLAN && endpoint.Scope != model.ScopeHostNet && endpoint.Scope != model.ScopeLoopback {
			continue
		}
		if endpoint.Source == model.SourceInferred || endpoint.Source == model.SourceProxyLabel {
			continue
		}
		key := fmt.Sprintf("%d/%s", endpoint.Port, endpoint.Protocol)
		groups[key] = append(groups[key], endpoint)
	}

	warnings := make([]model.Warning, 0)
	for _, group := range groups {
		if len(group) < 2 {
			continue
		}
		involved := make(map[int]bool)
		for i := 0; i < len(group); i++ {
			for j := i + 1; j < len(group); j++ {
				if endpointOwnerKey(group[i]) == endpointOwnerKey(group[j]) {
					continue
				}
				if !bindingsOverlap(group[i], group[j]) {
					continue
				}
				involved[i] = true
				involved[j] = true
			}
		}
		if len(involved) < 2 {
			continue
		}
		services := make(map[string]bool)
		for index := range involved {
			services[group[index].Service] = true
		}
		if len(services) < 2 {
			continue
		}
		names := make([]string, 0, len(services))
		for name := range services {
			names = append(names, name)
		}
		sort.Strings(names)
		first := group[0]
		warnings = append(warnings, model.Warning{
			Type:     "PORT_CONFLICT",
			Severity: "danger",
			Title:    "端口冲突",
			Message:  fmt.Sprintf("%d/%s 同时被 %s 使用", first.Port, first.Protocol, strings.Join(names, " 与 ")),
			Detail:   "同一宿主机网络地址上存在多个监听",
		})
	}
	sort.Slice(warnings, func(i, j int) bool { return warnings[i].Message < warnings[j].Message })
	return warnings
}

func endpointOwnerKey(endpoint model.Endpoint) string {
	if endpoint.Container != "" && endpoint.Container != "—" {
		return endpoint.Container
	}
	return endpoint.Service
}

func endpointBindings(endpoint model.Endpoint) (bool, map[string]bool) {
	ips := make(map[string]bool)
	wildcard := netutil.IsWildcardIP(endpoint.IP)
	if !wildcard && endpoint.IP != "" {
		ips[endpoint.IP] = true
	}
	for _, item := range endpoint.AccessIPs {
		if item.IP != "" && !netutil.IsWildcardIP(item.IP) {
			ips[item.IP] = true
		}
	}
	return wildcard, ips
}

func bindingsOverlap(a, b model.Endpoint) bool {
	leftWildcard, leftIPs := endpointBindings(a)
	rightWildcard, rightIPs := endpointBindings(b)
	if leftWildcard && rightWildcard {
		return true
	}
	if leftWildcard {
		for ip := range rightIPs {
			if leftIPs[ip] || net.ParseIP(ip).IsLoopback() {
				return true
			}
		}
		return false
	}
	if rightWildcard {
		for ip := range leftIPs {
			if rightIPs[ip] || net.ParseIP(ip).IsLoopback() {
				return true
			}
		}
		return false
	}
	for ip := range leftIPs {
		if rightIPs[ip] {
			return true
		}
	}
	return false
}

func dedupeUsage(values []model.IPUsage) []model.IPUsage {
	seen := make(map[string]bool, len(values))
	out := make([]model.IPUsage, 0, len(values))
	for _, value := range values {
		if value.IP == "" {
			continue
		}
		key := value.IP + "|" + value.Kind + "|" + value.Container
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].IP == out[j].IP {
			return out[i].Kind < out[j].Kind
		}
		return out[i].IP < out[j].IP
	})
	return out
}

func uniqueIPCount(values []model.IPUsage) int {
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		seen[value.IP] = true
	}
	return len(seen)
}

func containerCount(values []model.IPUsage) int {
	seen := make(map[string]bool)
	for _, value := range values {
		if value.Kind == "container" && value.Container != "" {
			seen[value.Container] = true
		}
	}
	return len(seen)
}

func trimCIDR(value string) string {
	if value == "" {
		return ""
	}
	if index := strings.IndexByte(value, '/'); index >= 0 {
		return value[:index]
	}
	return value
}
