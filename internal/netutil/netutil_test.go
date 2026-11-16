package netutil

import (
	"testing"

	"github.com/MaroD1M/docklens/internal/model"
)

func TestParsePortSpec(t *testing.T) {
	port, protocol, ok := ParsePortSpec("80/tcp")
	if !ok || port != 80 || protocol != model.ProtocolTCP {
		t.Fatalf("unexpected result: %d %s %v", port, protocol, ok)
	}
	port, protocol, ok = ParsePortSpec("53/udp")
	if !ok || port != 53 || protocol != model.ProtocolUDP {
		t.Fatalf("unexpected udp result: %d %s %v", port, protocol, ok)
	}
	if _, _, ok := ParsePortSpec("bad/tcp"); ok {
		t.Fatal("expected invalid port")
	}
}

func TestCIDROverlap(t *testing.T) {
	if !CIDROverlap("172.18.0.0/16", "172.18.5.0/24") {
		t.Fatal("expected overlap")
	}
	if CIDROverlap("172.18.0.0/16", "172.19.0.0/16") {
		t.Fatal("expected no overlap")
	}
}

func TestCIDRInfo(t *testing.T) {
	family, total, ok := CIDRInfo("192.168.1.0/24")
	if !ok || family != 4 || total == nil || *total != 254 {
		t.Fatalf("unexpected ipv4 info: %d %v %v", family, total, ok)
	}
	family, total, ok = CIDRInfo("fd00::/64")
	if !ok || family != 6 || total != nil {
		t.Fatalf("unexpected ipv6 info: %d %v %v", family, total, ok)
	}
}

func TestIsSensitiveKey(t *testing.T) {
	if !IsSensitiveKey("POSTGRES_PASSWORD") {
		t.Fatal("expected sensitive key")
	}
	if IsSensitiveKey("TZ") {
		t.Fatal("expected safe key")
	}
}
