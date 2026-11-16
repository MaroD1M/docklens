package netutil

import (
	"crypto/sha256"
	"encoding/hex"
	"net"
	"sort"
	"strconv"
	"strings"

	"github.com/MaroD1M/docklens/internal/model"
)

func ParsePortSpec(spec string) (int, model.Protocol, bool) {
	parts := strings.SplitN(spec, "/", 2)
	if len(parts) == 0 {
		return 0, "", false
	}
	port, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || port < 1 || port > 65535 {
		return 0, "", false
	}
	proto := model.ProtocolTCP
	if len(parts) == 2 {
		switch strings.ToLower(strings.TrimSpace(parts[1])) {
		case "udp":
			proto = model.ProtocolUDP
		case "sctp":
			proto = model.ProtocolSCTP
		}
	}
	return port, proto, true
}

func Scheme(port int) string {
	switch port {
	case 443, 8443, 9443:
		return "https"
	default:
		return "http"
	}
}

func IsWildcardIP(ip string) bool {
	return ip == "" || ip == "0.0.0.0" || ip == "::" || ip == "[::]"
}

func CIDROverlap(a, b string) bool {
	_, na, errA := net.ParseCIDR(a)
	_, nb, errB := net.ParseCIDR(b)
	if errA != nil || errB != nil {
		return false
	}
	return na.Contains(nb.IP) || nb.Contains(na.IP)
}

func CIDRInfo(cidr string) (family int, total *int64, ok bool) {
	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		return 0, nil, false
	}
	ones, bits := network.Mask.Size()
	family = 4
	if bits == 128 {
		family = 6
	}
	if bits == 32 {
		count := int64(1) << uint(bits-ones)
		if ones <= 30 {
			count -= 2
		}
		if count < 0 {
			count = 0
		}
		total = &count
	}
	return family, total, true
}

func ContainsIP(cidr, ip string) bool {
	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		return false
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	return network.Contains(parsed)
}

func StableID(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return hex.EncodeToString(sum[:])[:16]
}

func SortIPs(values []string) {
	sort.Slice(values, func(i, j int) bool {
		a := net.ParseIP(values[i])
		b := net.ParseIP(values[j])
		if a == nil || b == nil {
			return values[i] < values[j]
		}
		if a.To4() != nil && b.To4() == nil {
			return true
		}
		if a.To4() == nil && b.To4() != nil {
			return false
		}
		return strings.Compare(values[i], values[j]) < 0
	})
}

func IsSensitiveKey(key string) bool {
	upper := strings.ToUpper(key)
	for _, token := range []string{"PASSWORD", "PASSWD", "SECRET", "TOKEN", "KEY", "CREDENTIAL", "PRIVATE"} {
		if strings.Contains(upper, token) {
			return true
		}
	}
	return false
}

func ParseEnv(item string) (string, string) {
	parts := strings.SplitN(item, "=", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return parts[0], ""
}

func PortFromString(value string) (int, bool) {
	trimmed := strings.TrimSpace(value)
	trimmed = strings.TrimPrefix(trimmed, ":")
	trimmed = strings.TrimSuffix(trimmed, "/tcp")
	trimmed = strings.TrimSuffix(trimmed, "/udp")
	port, err := strconv.Atoi(trimmed)
	if err != nil || port < 1 || port > 65535 {
		return 0, false
	}
	return port, true
}
