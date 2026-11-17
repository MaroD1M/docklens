package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/MaroD1M/docklens/internal/model"
	"github.com/MaroD1M/docklens/internal/netutil"
	"github.com/MaroD1M/docklens/internal/state"
)

func (s *Server) handleEndpoints(w http.ResponseWriter, r *http.Request) {
	snapshot := s.state.SnapshotCopy()
	query := r.URL.Query()
	filter := model.EndpointFilter{
		Query:    query.Get("q"),
		Scope:    query.Get("scope"),
		Source:   query.Get("source"),
		Protocol: query.Get("proto"),
		State:    query.Get("state"),
		Network:  query.Get("network"),
		Tag:      query.Get("tag"),
		Favorite: query.Get("favorite") == "true",
	}
	if query.Get("hidden") == "" {
		if query.Get("includeHidden") != "true" {
			hidden := false
			filter.Hidden = &hidden
		}
	} else {
		hidden := query.Get("hidden") == "true"
		filter.Hidden = &hidden
	}

	items := filterEndpoints(snapshot.Endpoints, filter)
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Service == items[j].Service {
			return items[i].Port < items[j].Port
		}
		return items[i].Service < items[j].Service
	})

	page := positiveInt(query.Get("page"), 1)
	if page > 100000 {
		page = 100000
	}
	pageSize := positiveInt(query.Get("pageSize"), 50)
	if pageSize > 200 {
		pageSize = 200
	}
	total := len(items)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":     items[start:end],
		"total":     total,
		"page":      page,
		"pageSize":  pageSize,
		"scannedAt": snapshot.ScannedAt,
	})
}

func (s *Server) handleEndpointPatch(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var patch state.MetaPatch
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "请求内容不是有效的 JSON", err.Error())
		return
	}
	endpoint, ok := s.state.UpdateMeta(id, patch)
	if !ok {
		writeError(w, http.StatusNotFound, "ENDPOINT_NOT_FOUND", "端点不存在", id)
		return
	}
	writeJSON(w, http.StatusOK, endpoint)
}

func (s *Server) handleContainers(w http.ResponseWriter, r *http.Request) {
	snapshot := s.state.SnapshotCopy()
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	items := make([]model.Container, 0, len(snapshot.Containers))
	for _, container := range snapshot.Containers {
		if query != "" {
			haystack := strings.ToLower(container.Name + " " + container.Service + " " + container.Image + " " + container.Stack)
			if !strings.Contains(haystack, query) {
				continue
			}
		}
		items = append(items, container)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items), "scannedAt": snapshot.ScannedAt})
}

func (s *Server) handleContainer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	snapshot := s.state.SnapshotCopy()
	var found *model.Container
	for index := range snapshot.Containers {
		container := &snapshot.Containers[index]
		if container.ID == id || container.Name == id || container.Service == id {
			found = container
			break
		}
	}
	if found == nil {
		writeError(w, http.StatusNotFound, "CONTAINER_NOT_FOUND", "容器不存在", id)
		return
	}
	endpoints := make([]model.Endpoint, 0)
	for _, endpoint := range snapshot.Endpoints {
		if endpoint.Container == found.Name {
			endpoints = append(endpoints, endpoint)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"container": found,
		"endpoints": endpoints,
		"networks":  snapshot.Networks,
	})
}

func (s *Server) handleNetworks(w http.ResponseWriter, r *http.Request) {
	snapshot := s.state.SnapshotCopy()
	writeJSON(w, http.StatusOK, map[string]any{"items": snapshot.Networks, "total": len(snapshot.Networks), "scannedAt": snapshot.ScannedAt})
}

func (s *Server) handleIPPools(w http.ResponseWriter, r *http.Request) {
	snapshot := s.state.SnapshotCopy()
	writeJSON(w, http.StatusOK, map[string]any{"items": snapshot.IPPools, "total": len(snapshot.IPPools), "scannedAt": snapshot.ScannedAt})
}

func (s *Server) handleTopology(w http.ResponseWriter, r *http.Request) {
	snapshot := s.state.SnapshotCopy()
	writeJSON(w, http.StatusOK, buildTopology(snapshot))
}

func (s *Server) handleCheckPort(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	port, err := strconv.Atoi(query.Get("port"))
	if err != nil || port < 1 || port > 65535 {
		writeError(w, http.StatusBadRequest, "INVALID_PORT", "端口必须在 1 到 65535 之间", "")
		return
	}
	protocol := strings.ToLower(query.Get("proto"))
	if protocol == "" {
		protocol = "tcp"
	}
	if protocol != "tcp" && protocol != "udp" && protocol != "sctp" {
		writeError(w, http.StatusBadRequest, "INVALID_PROTOCOL", "协议必须是 tcp、udp 或 sctp", "")
		return
	}
	ip := strings.TrimSpace(query.Get("ip"))
	snapshot := s.state.SnapshotCopy()
	matches := make([]model.Endpoint, 0)
	used := make(map[int]bool)
	for _, endpoint := range snapshot.Endpoints {
		if string(endpoint.Protocol) != protocol || !isHostPortScope(endpoint.Scope) {
			continue
		}
		used[endpoint.Port] = true
		if endpoint.Port != port {
			continue
		}
		if !endpointMatchesIP(endpoint, ip) {
			continue
		}
		matches = append(matches, endpoint)
	}
	alternatives := nextFreePorts(port+1, 65535, 5, used)
	writeJSON(w, http.StatusOK, map[string]any{
		"ip":           ip,
		"port":         port,
		"protocol":     protocol,
		"available":    len(matches) == 0,
		"matches":      matches,
		"alternatives": alternatives,
	})
}

func (s *Server) handleFreePort(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	from, errFrom := strconv.Atoi(query.Get("from"))
	to, errTo := strconv.Atoi(query.Get("to"))
	if errFrom != nil || errTo != nil || from < 1 || to > 65535 || from > to {
		writeError(w, http.StatusBadRequest, "INVALID_RANGE", "端口范围无效", "from 和 to 必须在 1 到 65535 之间且 from <= to")
		return
	}
	count := positiveInt(query.Get("count"), 5)
	if count > 50 {
		count = 50
	}
	protocol := strings.ToLower(query.Get("proto"))
	if protocol == "" {
		protocol = "tcp"
	}
	if protocol != "tcp" && protocol != "udp" && protocol != "sctp" && protocol != "all" {
		writeError(w, http.StatusBadRequest, "INVALID_PROTOCOL", "协议必须是 tcp、udp、sctp 或 all", "")
		return
	}
	snapshot := s.state.SnapshotCopy()
	used := make(map[int]bool)
	for _, endpoint := range snapshot.Endpoints {
		if !isHostPortScope(endpoint.Scope) {
			continue
		}
		if protocol == "all" || string(endpoint.Protocol) == protocol {
			used[endpoint.Port] = true
		}
	}
	ports := make([]int, 0, count)
	for port := from; port <= to && len(ports) < count; port++ {
		if !used[port] {
			ports = append(ports, port)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"from":     from,
		"to":       to,
		"protocol": protocol,
		"count":    count,
		"ports":    ports,
	})
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	snapshot := s.state.SnapshotCopy()
	format := strings.ToLower(r.URL.Query().Get("format"))
	if format == "" {
		format = "json"
	}
	filename := "docklens-endpoints-" + time.Now().Format("20060102-1504")
	switch format {
	case "json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`.json"`)
		encoder := json.NewEncoder(w)
		encoder.SetIndent("", "  ")
		_ = encoder.Encode(snapshot.Endpoints)
	case "csv":
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`.csv"`)
		writer := csv.NewWriter(w)
		_ = writer.Write([]string{"service", "container", "ip", "port", "protocol", "scope", "source", "network", "url", "tags"})
		for _, endpoint := range snapshot.Endpoints {
			_ = writer.Write([]string{
				endpoint.Service,
				endpoint.Container,
				endpoint.IP,
				strconv.Itoa(endpoint.Port),
				string(endpoint.Protocol),
				string(endpoint.Scope),
				string(endpoint.Source),
				endpoint.Network,
				endpoint.URL,
				strings.Join(endpoint.Tags, ","),
			})
		}
		writer.Flush()
	case "md", "markdown":
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`.md"`)
		var builder strings.Builder
		builder.WriteString("| 服务 | 地址 | 协议 | 作用域 | 网络 |\n|---|---|---|---|---|\n")
		for _, endpoint := range snapshot.Endpoints {
			builder.WriteString(fmt.Sprintf("| %s | %s | %s | %s | %s |\n",
				endpoint.Service,
				endpoint.Address(),
				endpoint.Protocol,
				endpoint.Scope,
				endpoint.Network,
			))
		}
		_, _ = w.Write([]byte(builder.String()))
	default:
		writeError(w, http.StatusBadRequest, "INVALID_FORMAT", "导出格式必须是 json、csv 或 md", "")
	}
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.state.Settings())
}

func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	var values map[string]any
	if err := json.NewDecoder(r.Body).Decode(&values); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "请求内容不是有效的 JSON", err.Error())
		return
	}
	if err := s.state.SetSettings(values); err != nil {
		writeError(w, http.StatusInternalServerError, "SAVE_FAILED", "无法保存设置", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, values)
}

func endpointMatchesIP(endpoint model.Endpoint, ip string) bool {
	if ip == "" || netutil.IsWildcardIP(ip) {
		return true
	}
	if endpoint.IP == ip {
		return true
	}
	if endpoint.IP == "0.0.0.0" && !strings.Contains(ip, ":") {
		return true
	}
	if endpoint.IP == "::" && strings.Contains(ip, ":") {
		return true
	}
	for _, item := range endpoint.AccessIPs {
		if item.IP == ip {
			return true
		}
	}
	return false
}

func isHostPortScope(scope model.Scope) bool {
	switch scope {
	case model.ScopeHost, model.ScopeLAN, model.ScopeHostNet, model.ScopeLoopback:
		return true
	default:
		return false
	}
}

func positiveInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
}

func nextFreePorts(start, end, count int, used map[int]bool) []int {
	out := make([]int, 0, count)
	for port := start; port <= end && len(out) < count; port++ {
		if !used[port] {
			out = append(out, port)
		}
	}
	return out
}

func buildTopology(snapshot model.Snapshot) model.Topology {
	nodes := make([]model.TopologyNode, 0, len(snapshot.Containers)+len(snapshot.Networks)+len(snapshot.Endpoints)+1)
	edges := make([]model.TopologyEdge, 0, len(snapshot.Containers)+len(snapshot.Networks)+len(snapshot.Endpoints))
	nodes = append(nodes, model.TopologyNode{
		ID: "host:local", Type: "host", Label: snapshot.Host.Name,
		Sublabel: snapshot.Host.PreferredIP, X: 90, Y: 80,
	})

	cursorY := 80
	for _, network := range snapshot.Networks {
		networkNodeID := "net:" + network.ID
		networkNode := model.TopologyNode{
			ID: networkNodeID, Type: "network", Label: network.Name,
			Sublabel: network.Driver + " · " + network.Subnet, X: 330, Y: cursorY,
			Status: "running",
		}
		nodes = append(nodes, networkNode)
		edges = append(edges, model.TopologyEdge{ID: "edge:host:" + network.ID, Source: "host:local", Target: networkNodeID})

		containers := make([]model.Container, 0)
		for _, container := range snapshot.Containers {
			for _, item := range container.Networks {
				if item.Name == network.Name {
					containers = append(containers, container)
					break
				}
			}
		}
		endpoints := make([]model.Endpoint, 0)
		for _, endpoint := range snapshot.Endpoints {
			if endpoint.Network != network.Name {
				continue
			}
			if endpoint.Scope != model.ScopeHost && endpoint.Scope != model.ScopeLAN && endpoint.Scope != model.ScopeHostNet {
				continue
			}
			endpoints = append(endpoints, endpoint)
		}
		rows := len(containers)
		if len(endpoints) > rows {
			rows = len(endpoints)
		}
		if rows == 0 {
			rows = 1
		}
		networkNode.Y = cursorY + (rows-1)*26
		nodes[len(nodes)-1] = networkNode
		for index, container := range containers {
			containerNodeID := "ctr:" + network.ID + ":" + container.ID
			ip := ""
			for _, item := range container.Networks {
				if item.Name == network.Name {
					ip = item.IP
					break
				}
			}
			nodes = append(nodes, model.TopologyNode{
				ID: containerNodeID, Type: "container", Label: container.Name, Sublabel: ip,
				X: 640, Y: cursorY + index*52, Status: container.State,
			})
			edges = append(edges, model.TopologyEdge{ID: "edge:" + network.ID + ":" + container.ID, Source: networkNodeID, Target: containerNodeID})
		}
		for index, endpoint := range endpoints {
			endpointNodeID := "ep:" + endpoint.ID
			nodes = append(nodes, model.TopologyNode{
				ID: endpointNodeID, Type: "endpoint",
				Label:    fmt.Sprintf("%d/%s", endpoint.Port, endpoint.Protocol),
				Sublabel: endpoint.Service, X: 960, Y: cursorY + index*52,
				Status: "running",
			})
			owner := networkNodeID
			for _, container := range containers {
				if container.Name == endpoint.Container {
					owner = "ctr:" + network.ID + ":" + container.ID
					break
				}
			}
			edges = append(edges, model.TopologyEdge{ID: "edge:ep:" + endpoint.ID, Source: owner, Target: endpointNodeID, Animated: true})
		}
		cursorY += rows*52 + 50
	}
	return model.Topology{Nodes: nodes, Edges: edges}
}
