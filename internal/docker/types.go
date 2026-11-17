package docker

type Info struct {
	Name          string `json:"Name"`
	ServerVersion string `json:"ServerVersion"`
}

type Version struct {
	Version       string `json:"Version"`
	APIVersion    string `json:"ApiVersion"`
	MinAPIVersion string `json:"MinAPIVersion"`
	OSType        string `json:"Os"`
	Arch          string `json:"Arch"`
	KernelVersion string `json:"KernelVersion"`
}

type Port struct {
	IP          string `json:"IP"`
	PrivatePort int    `json:"PrivatePort"`
	PublicPort  int    `json:"PublicPort"`
	Type        string `json:"Type"`
}

type ContainerSummary struct {
	ID              string            `json:"Id"`
	Names           []string          `json:"Names"`
	Image           string            `json:"Image"`
	ImageID         string            `json:"ImageID"`
	Command         string            `json:"Command"`
	Created         int64             `json:"Created"`
	State           string            `json:"State"`
	Status          string            `json:"Status"`
	Ports           []Port            `json:"Ports"`
	Labels          map[string]string `json:"Labels"`
	NetworkSettings struct {
		Networks map[string]*EndpointSettings `json:"Networks"`
	} `json:"NetworkSettings"`
}

type EndpointSettings struct {
	IPAddress           string   `json:"IPAddress"`
	GlobalIPv6Address   string   `json:"GlobalIPv6Address"`
	IPPrefixLen         int      `json:"IPPrefixLen"`
	GlobalIPv6PrefixLen int      `json:"GlobalIPv6PrefixLen"`
	MacAddress          string   `json:"MacAddress"`
	Gateway             string   `json:"Gateway"`
	IPv6Gateway         string   `json:"IPv6Gateway"`
	NetworkID           string   `json:"NetworkID"`
	Aliases             []string `json:"Aliases"`
}

type PortBinding struct {
	HostIP   string `json:"HostIp"`
	HostPort string `json:"HostPort"`
}

type Healthcheck struct {
	Test     []string `json:"Test"`
	Interval int64    `json:"Interval"`
	Timeout  int64    `json:"Timeout"`
	Retries  int      `json:"Retries"`
}

type ContainerInspect struct {
	ID      string `json:"Id"`
	Name    string `json:"Name"`
	Created string `json:"Created"`
	State   struct {
		Status       string `json:"Status"`
		Running      bool   `json:"Running"`
		StartedAt    string `json:"StartedAt"`
		RestartCount int    `json:"RestartCount"`
	} `json:"State"`
	Config struct {
		Image        string                    `json:"Image"`
		Hostname     string                    `json:"Hostname"`
		Domainname   string                    `json:"Domainname"`
		ExposedPorts map[string]map[string]any `json:"ExposedPorts"`
		Labels       map[string]string         `json:"Labels"`
		Env          []string                  `json:"Env"`
		Cmd          []string                  `json:"Cmd"`
		Entrypoint   []string                  `json:"Entrypoint"`
		Healthcheck  *Healthcheck              `json:"Healthcheck"`
	} `json:"Config"`
	HostConfig struct {
		NetworkMode string `json:"NetworkMode"`
	} `json:"HostConfig"`
	NetworkSettings struct {
		Networks map[string]*EndpointSettings `json:"Networks"`
		Ports    map[string][]PortBinding     `json:"Ports"`
	} `json:"NetworkSettings"`
}

type IPAMConfig struct {
	Subnet  string `json:"Subnet"`
	Gateway string `json:"Gateway"`
	IPRange string `json:"IPRange"`
}

type NetworkContainer struct {
	Name        string `json:"Name"`
	MacAddress  string `json:"MacAddress"`
	IPv4Address string `json:"IPv4Address"`
	IPv6Address string `json:"IPv6Address"`
}

type Network struct {
	ID       string            `json:"Id"`
	Name     string            `json:"Name"`
	Driver   string            `json:"Driver"`
	Scope    string            `json:"Scope"`
	Internal bool              `json:"Internal"`
	Labels   map[string]string `json:"Labels"`
	IPAM     struct {
		Config []IPAMConfig `json:"Config"`
	} `json:"IPAM"`
	Containers map[string]NetworkContainer `json:"Containers"`
}

type EventActor struct {
	ID         string            `json:"ID"`
	Attributes map[string]string `json:"Attributes"`
}

type EventMessage struct {
	Type     string     `json:"Type"`
	Action   string     `json:"Action"`
	Actor    EventActor `json:"Actor"`
	Time     int64      `json:"time"`
	TimeNano int64      `json:"timeNano"`
}
