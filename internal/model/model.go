package model

import (
	"strconv"
	"strings"
	"time"
)

type Scope string

const (
	ScopeHost      Scope = "HOST"
	ScopeContainer Scope = "CONTAINER"
	ScopeLAN       Scope = "LAN"
	ScopeOverlay   Scope = "OVERLAY"
	ScopeLoopback  Scope = "LOOPBACK"
	ScopeHostNet   Scope = "HOST_NET"
	ScopeExternal  Scope = "EXTERNAL"
)

type Source string

const (
	SourcePublished    Source = "PUBLISHED"
	SourceHostListener Source = "HOST_LISTENER"
	SourceExposed      Source = "EXPOSED"
	SourceProxyLabel   Source = "PROXY_LABEL"
	SourceInferred     Source = "INFERRED"
	SourceManual       Source = "MANUAL"
)

type Status string

const (
	StatusRunning Status = "running"
	StatusStale   Status = "stale"
	StatusHidden  Status = "hidden"
)

type Protocol string

const (
	ProtocolTCP  Protocol = "tcp"
	ProtocolUDP  Protocol = "udp"
	ProtocolSCTP Protocol = "sctp"
)

type AccessIP struct {
	IP        string `json:"ip"`
	Kind      string `json:"kind"`
	Iface     string `json:"iface,omitempty"`
	Preferred bool   `json:"preferred,omitempty"`
}

type HostInfo struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	DockerVersion string     `json:"dockerVersion,omitempty"`
	APIVersion    string     `json:"apiVersion,omitempty"`
	Uptime        string     `json:"uptime,omitempty"`
	PreferredIP   string     `json:"preferredIp,omitempty"`
	Addresses     []AccessIP `json:"addresses,omitempty"`
}

type Endpoint struct {
	ID            string     `json:"id"`
	Service       string     `json:"service"`
	Container     string     `json:"container"`
	Image         string     `json:"image"`
	Stack         string     `json:"stack,omitempty"`
	Scope         Scope      `json:"scope"`
	Source        Source     `json:"source"`
	Status        Status     `json:"status"`
	IP            string     `json:"ip"`
	Port          int        `json:"port"`
	Protocol      Protocol   `json:"protocol"`
	ContainerPort int        `json:"containerPort,omitempty"`
	Network       string     `json:"network"`
	NetworkID     string     `json:"networkId,omitempty"`
	URL           string     `json:"url,omitempty"`
	Tags          []string   `json:"tags"`
	Favorite      bool       `json:"favorite"`
	Hidden        bool       `json:"hidden"`
	Confidence    int        `json:"confidence"`
	UpdatedAt     string     `json:"updatedAt"`
	AccessIPs     []AccessIP `json:"accessIps,omitempty"`
	Note          string     `json:"note,omitempty"`
}

func (e Endpoint) Address() string {
	host := e.IP
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	return host + ":" + strconv.Itoa(e.Port)
}

type ContainerNetwork struct {
	Name    string `json:"name"`
	IP      string `json:"ip"`
	IPv6    string `json:"ipv6,omitempty"`
	Gateway string `json:"gateway,omitempty"`
	MAC     string `json:"mac,omitempty"`
}

type Container struct {
	ID            string             `json:"id"`
	Name          string             `json:"name"`
	Service       string             `json:"service"`
	Image         string             `json:"image"`
	Stack         string             `json:"stack"`
	State         string             `json:"state"`
	StatusText    string             `json:"statusText"`
	StartedAt     string             `json:"startedAt"`
	RestartCount  int                `json:"restartCount"`
	Networks      []ContainerNetwork `json:"networks"`
	EndpointCount int                `json:"endpointCount"`
	Color         string             `json:"color"`
}

type IPUsage struct {
	IP        string   `json:"ip"`
	Kind      string   `json:"kind"`
	Container string   `json:"container,omitempty"`
	Aliases   []string `json:"aliases,omitempty"`
}

type IPPool struct {
	NetworkID   string    `json:"networkId"`
	CIDR        string    `json:"cidr"`
	Family      int       `json:"family"`
	Gateway     string    `json:"gateway,omitempty"`
	Total       *int64    `json:"total"`
	Used        int       `json:"used"`
	Free        *int64    `json:"free"`
	UsedIPs     []IPUsage `json:"usedIps"`
	Utilization *float64  `json:"utilization"`
}

type Network struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Driver         string    `json:"driver"`
	Scope          string    `json:"scope"`
	Subnet         string    `json:"subnet"`
	Gateway        string    `json:"gateway"`
	IPv6Subnet     string    `json:"ipv6Subnet,omitempty"`
	Internal       bool      `json:"internal"`
	ContainerCount int       `json:"containerCount"`
	UsedCount      int       `json:"usedCount"`
	TotalCount     int64     `json:"totalCount"`
	Utilization    float64   `json:"utilization"`
	Warning        string    `json:"warning,omitempty"`
	UsedIPs        []IPUsage `json:"usedIps"`
}

type Warning struct {
	Type     string `json:"type"`
	Severity string `json:"severity"`
	Title    string `json:"title,omitempty"`
	Message  string `json:"message"`
	Detail   string `json:"detail,omitempty"`
}

type Event struct {
	ID     string    `json:"id"`
	At     string    `json:"at"`
	Time   time.Time `json:"-"`
	Type   string    `json:"type"`
	Title  string    `json:"title"`
	Detail string    `json:"detail"`
}

type Counts struct {
	Containers int `json:"containers"`
	Endpoints  int `json:"endpoints"`
	Networks   int `json:"networks"`
	Conflicts  int `json:"conflicts"`
	NewToday   int `json:"newToday"`
	IPChanges  int `json:"ipChanges"`
}

type Overview struct {
	Host      HostInfo   `json:"host"`
	Counts    Counts     `json:"counts"`
	Warnings  []Warning  `json:"warnings"`
	Recent    []Event    `json:"recent"`
	Favorites []Endpoint `json:"favorites"`
}

type Snapshot struct {
	ScannedAt  time.Time   `json:"scannedAt"`
	Host       HostInfo    `json:"host"`
	Containers []Container `json:"containers"`
	Networks   []Network   `json:"networks"`
	Endpoints  []Endpoint  `json:"endpoints"`
	IPPools    []IPPool    `json:"ipPools"`
	Warnings   []Warning   `json:"warnings"`
	Recent     []Event     `json:"recent"`
}

type TopologyNode struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Label    string `json:"label"`
	Sublabel string `json:"sublabel,omitempty"`
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Status   string `json:"status,omitempty"`
}

type TopologyEdge struct {
	ID       string `json:"id"`
	Source   string `json:"source"`
	Target   string `json:"target"`
	Animated bool   `json:"animated,omitempty"`
}

type Topology struct {
	Nodes []TopologyNode `json:"nodes"`
	Edges []TopologyEdge `json:"edges"`
}

type EndpointFilter struct {
	Query    string
	Scope    string
	Source   string
	Protocol string
	State    string
	Network  string
	Tag      string
	Favorite bool
	Hidden   *bool
}
