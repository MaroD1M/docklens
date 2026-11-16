package hostscan

import (
	"bufio"
	"context"
	"encoding/hex"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type Listener struct {
	IP       string
	Port     int
	Protocol string
	Process  string
	PID      int
	Inode    string
}

type Scanner struct {
	ProcRoot string
}

func New() *Scanner {
	return &Scanner{ProcRoot: "/proc"}
}

func (s *Scanner) Scan(ctx context.Context) ([]Listener, error) {
	processes := s.processMap(ctx)
	files := []struct {
		name     string
		protocol string
		tcp      bool
	}{
		{"tcp", "tcp", true},
		{"tcp6", "tcp", true},
		{"udp", "udp", false},
		{"udp6", "udp", false},
	}

	seen := make(map[string]bool)
	listeners := make([]Listener, 0)
	for _, file := range files {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		path := filepath.Join(s.ProcRoot, "net", file.name)
		handle, err := os.Open(path)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(handle)
		first := true
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if first {
				first = false
				continue
			}
			if line == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) < 10 {
				continue
			}
			state := strings.ToUpper(fields[3])
			if file.tcp && state != "0A" {
				continue
			}
			ip, port, ok := parseAddress(fields[1])
			if !ok || port == 0 {
				continue
			}
			inode := fields[9]
			processName := ""
			pid := 0
			if value, ok := processes[inode]; ok {
				processName = value.name
				pid = value.pid
			}
			key := ip + "|" + strconv.Itoa(port) + "|" + file.protocol + "|" + processName
			if seen[key] {
				continue
			}
			seen[key] = true
			listeners = append(listeners, Listener{
				IP:       ip,
				Port:     port,
				Protocol: file.protocol,
				Process:  processName,
				PID:      pid,
				Inode:    inode,
			})
		}
		_ = handle.Close()
	}
	sort.Slice(listeners, func(i, j int) bool {
		if listeners[i].Port == listeners[j].Port {
			return listeners[i].Protocol < listeners[j].Protocol
		}
		return listeners[i].Port < listeners[j].Port
	})
	return listeners, nil
}

type processInfo struct {
	name string
	pid  int
}

func (s *Scanner) processMap(ctx context.Context) map[string]processInfo {
	result := make(map[string]processInfo)
	entries, err := os.ReadDir(s.ProcRoot)
	if err != nil {
		return result
	}
	for _, entry := range entries {
		if ctx.Err() != nil {
			return result
		}
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}
		name := readComm(filepath.Join(s.ProcRoot, entry.Name(), "comm"))
		fdDir := filepath.Join(s.ProcRoot, entry.Name(), "fd")
		links, err := os.ReadDir(fdDir)
		if err != nil {
			continue
		}
		for _, link := range links {
			target, err := os.Readlink(filepath.Join(fdDir, link.Name()))
			if err != nil {
				continue
			}
			if strings.HasPrefix(target, "socket:[") && strings.HasSuffix(target, "]") {
				inode := strings.TrimSuffix(strings.TrimPrefix(target, "socket:["), "]")
				if _, exists := result[inode]; !exists {
					result[inode] = processInfo{name: name, pid: pid}
				}
			}
		}
	}
	return result
}

func readComm(path string) string {
	raw, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func parseAddress(value string) (string, int, bool) {
	index := strings.LastIndexByte(value, ':')
	if index < 0 {
		return "", 0, false
	}
	hexIP := value[:index]
	hexPort := value[index+1:]
	port, err := strconv.ParseInt(hexPort, 16, 32)
	if err != nil || port < 1 || port > 65535 {
		return "", 0, false
	}
	ip, ok := parseIP(hexIP)
	if !ok {
		return "", 0, false
	}
	return ip, int(port), true
}

func parseIP(value string) (string, bool) {
	raw, err := hex.DecodeString(value)
	if err != nil {
		return "", false
	}
	switch len(raw) {
	case 4:
		return net.IPv4(raw[3], raw[2], raw[1], raw[0]).String(), true
	case 16:
		reversed := make([]byte, 16)
		for word := 0; word < 4; word++ {
			for index := 0; index < 4; index++ {
				reversed[word*4+index] = raw[word*4+3-index]
			}
		}
		return net.IP(reversed).String(), true
	default:
		return "", false
	}
}
