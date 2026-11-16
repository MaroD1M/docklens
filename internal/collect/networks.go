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
	type conflictGroup struct {
		ip        string
		port      int
		protocol  model.Protocol
		services  map[string]bool
		endpoints []model.Endpoint
	}
	groups := make(map[string]*conflictGroup)
	for _, endpoint := range endpoints {
		if endpoint.Status != model.StatusRunning {
			continue
		}
		if endpoint.Scope != model.ScopeHost && endpoint.Scope != model.ScopeLAN && endpoint.Scope != model.ScopeHostNet {
			continue
		}
		ip := endpoint.IP
		if netutil.IsWildcardIP(ip) {
			ip = "wildcard"
		}
		key := ip + "|" + fmt.Sprint(endpoint.Port) + "|" + string(endpoint.Protocol)
		group, ok := groups[key]
		if !ok {
			group = &conflictGroup{ip: ip, port: endpoint.Port, protocol: endpoint.Protocol, services: make(map[string]bool)}
			groups[key] = group
		}
		group.services[endpoint.Service] = true
		group.endpoints = append(group.endpoints, endpoint)
	}
	warnings := make([]model.Warning, 0)
	for _, group := range groups {
		if len(group.services) < 2 {
			continue
		}
		names := make([]string, 0, len(group.services))
		for name := range group.services {
			names = append(names, name)
		}
		sort.Strings(names)
		warnings = append(warnings, model.Warning{
			Type:     "PORT_CONFLICT",
			Severity: "danger",
			Title:    "端口冲突",
			Message:  fmt.Sprintf("%d/%s 同时被 %s 使用", group.port, group.protocol, strings.Join(names, " 与 ")),
			Detail:   "绑定地址 " + group.ip,
		})
	}
	sort.Slice(warnings, func(i, j int) bool { return warnings[i].Message < warnings[j].Message })
	return warnings
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
