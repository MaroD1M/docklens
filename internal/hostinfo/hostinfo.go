package hostinfo

import (
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/MaroD1M/docklens/internal/model"
)

type Info struct {
	Hostname    string
	Addresses   []model.AccessIP
	PreferredIP string
	Uptime      string
}

func Discover() Info {
	hostname, _ := os.Hostname()
	info := Info{Hostname: hostname}
	if hostname == "" {
		info.Hostname = "docklens-host"
	}

	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			if skipInterface(iface.Name) {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				ip, _, err := net.ParseCIDR(addr.String())
				if err != nil || ip == nil {
					continue
				}
				if ip.IsLoopback() || ip.IsLinkLocalUnicast() {
					continue
				}
				kind := classify(ip, iface.Name)
				info.Addresses = append(info.Addresses, model.AccessIP{
					IP:    ip.String(),
					Kind:  kind,
					Iface: iface.Name,
				})
			}
		}
	}

	if override := strings.TrimSpace(os.Getenv("DOCKLENS_HOST_IP")); override != "" {
		found := false
		for index := range info.Addresses {
			if info.Addresses[index].IP == override {
				info.Addresses[index].Kind = "lan"
				info.Addresses[index].Preferred = true
				found = true
			} else {
				info.Addresses[index].Preferred = false
			}
		}
		if !found {
			info.Addresses = append([]model.AccessIP{{IP: override, Kind: "lan", Iface: "override", Preferred: true}}, info.Addresses...)
		}
		info.PreferredIP = override
	} else {
		info.PreferredIP = choosePreferred(info.Addresses)
		for index := range info.Addresses {
			info.Addresses[index].Preferred = info.Addresses[index].IP == info.PreferredIP
		}
	}
	info.Uptime = readUptime()
	if len(info.Addresses) == 0 {
		info.PreferredIP = "127.0.0.1"
		info.Addresses = []model.AccessIP{{IP: "127.0.0.1", Kind: "loopback", Preferred: true}}
	}
	return info
}

func (i Info) Model(hostID, dockerVersion, apiVersion string) model.HostInfo {
	return model.HostInfo{
		ID:            hostID,
		Name:          i.Hostname,
		DockerVersion: dockerVersion,
		APIVersion:    apiVersion,
		Uptime:        i.Uptime,
		PreferredIP:   i.PreferredIP,
		Addresses:     i.Addresses,
	}
}

func skipInterface(name string) bool {
	prefixes := []string{"docker", "veth", "br-", "virbr", "cni", "flannel", "kube", "lxc", "lo"}
	for _, prefix := range prefixes {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return false
}

func classify(ip net.IP, iface string) string {
	name := strings.ToLower(iface)
	if strings.HasPrefix(name, "tailscale") || strings.HasPrefix(name, "wg") || strings.HasPrefix(name, "tun") || strings.HasPrefix(name, "tap") {
		return "vpn"
	}
	if ip.IsLoopback() {
		return "loopback"
	}
	if ip.To4() != nil && ip.IsPrivate() {
		return "lan"
	}
	if ip.IsPrivate() {
		return "lan"
	}
	return "public"
}

func choosePreferred(addresses []model.AccessIP) string {
	for _, address := range addresses {
		if address.Kind == "lan" && !strings.Contains(address.IP, ":") {
			return address.IP
		}
	}
	for _, address := range addresses {
		if address.Kind == "lan" {
			return address.IP
		}
	}
	for _, address := range addresses {
		if address.Kind == "vpn" {
			return address.IP
		}
	}
	if len(addresses) > 0 {
		return addresses[0].IP
	}
	return "127.0.0.1"
}

func readUptime() string {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return ""
	}
	fields := strings.Fields(string(data))
	if len(fields) == 0 {
		return ""
	}
	seconds, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return ""
	}
	duration := time.Duration(seconds) * time.Second
	days := int(duration.Hours()) / 24
	hours := int(duration.Hours()) % 24
	if days > 0 {
		return strconv.Itoa(days) + " 天 " + strconv.Itoa(hours) + " 小时"
	}
	return strconv.Itoa(int(duration.Hours())) + " 小时"
}
