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
