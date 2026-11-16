package hostscan

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestParseAddress(t *testing.T) {
	ip, port, ok := parseAddress("0100007F:1F90")
	if !ok || ip != "127.0.0.1" || port != 8080 {
		t.Fatalf("unexpected ipv4 parse: %s %d %v", ip, port, ok)
	}
	ip, port, ok = parseAddress("00000000000000000000000001000000:0050")
	if !ok || ip != "::1" || port != 80 {
		t.Fatalf("unexpected ipv6 parse: %s %d %v", ip, port, ok)
	}
}

func TestScanTCPListeners(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "net"), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n" +
		"   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12345 1 0000000000000000 100 0 0 10 0\n" +
		"   1: 0100007F:1F91 00000000:0000 01 00000000:00000000 00:00000000 00000000     0        0 12346 1 0000000000000000 100 0 0 10 0\n"
	if err := os.WriteFile(filepath.Join(root, "net", "tcp"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	scanner := &Scanner{ProcRoot: root}
	listeners, err := scanner.Scan(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(listeners) != 1 {
		t.Fatalf("expected 1 listener, got %d: %+v", len(listeners), listeners)
	}
	if listeners[0].Port != 8080 || listeners[0].Protocol != "tcp" {
		t.Fatalf("unexpected listener: %+v", listeners[0])
	}
}
