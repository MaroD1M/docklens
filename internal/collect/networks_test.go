package collect

import (
	"testing"

	"github.com/MaroD1M/docklens/internal/model"
)

func TestBindingsOverlapWildcard(t *testing.T) {
	wildcard := model.Endpoint{
		IP:        "0.0.0.0",
		AccessIPs: []model.AccessIP{{IP: "192.168.1.20", Kind: "lan"}},
	}
	hostSpecific := model.Endpoint{IP: "192.168.1.20"}
	lanSpecific := model.Endpoint{IP: "192.168.1.50"}
	loopback := model.Endpoint{IP: "127.0.0.1"}

	if !bindingsOverlap(wildcard, hostSpecific) {
		t.Fatal("wildcard should overlap host IP")
	}
	if bindingsOverlap(wildcard, lanSpecific) {
		t.Fatal("wildcard should not overlap unrelated macvlan IP")
	}
	if !bindingsOverlap(wildcard, loopback) {
		t.Fatal("wildcard should overlap loopback")
	}
	if !bindingsOverlap(model.Endpoint{IP: "0.0.0.0"}, model.Endpoint{IP: "::"}) {
		t.Fatal("two wildcard binds should overlap")
	}
}

func TestPortConflictsIgnoreInternalAndStopped(t *testing.T) {
	endpoints := []model.Endpoint{
		{Service: "web", Container: "web", Scope: model.ScopeHost, Status: model.StatusRunning, IP: "0.0.0.0", Port: 8080, Protocol: model.ProtocolTCP, AccessIPs: []model.AccessIP{{IP: "192.168.1.20"}}},
		{Service: "host-nginx", Container: "nginx", Scope: model.ScopeHost, Status: model.StatusRunning, IP: "0.0.0.0", Port: 8080, Protocol: model.ProtocolTCP, AccessIPs: []model.AccessIP{{IP: "192.168.1.20"}}},
		{Service: "db", Container: "db", Scope: model.ScopeContainer, Status: model.StatusRunning, IP: "172.18.0.5", Port: 5432, Protocol: model.ProtocolTCP},
		{Service: "old", Container: "old", Scope: model.ScopeHost, Status: model.StatusStale, IP: "0.0.0.0", Port: 9090, Protocol: model.ProtocolTCP},
	}
	warnings := portConflicts(endpoints)
	if len(warnings) != 1 {
		t.Fatalf("expected one conflict warning, got %+v", warnings)
	}
}
