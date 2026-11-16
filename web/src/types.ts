export type PageKey =
  | "overview"
  | "endpoints"
  | "ports"
  | "networks"
  | "topology"
  | "tools"
  | "settings";

export type EndpointScope =
  | "HOST"
  | "CONTAINER"
  | "LAN"
  | "OVERLAY"
  | "LOOPBACK"
  | "HOST_NET"
  | "EXTERNAL";

export type EndpointSource =
  | "PUBLISHED"
  | "HOST_LISTENER"
  | "EXPOSED"
  | "PROXY_LABEL"
  | "INFERRED"
  | "MANUAL";

export type EndpointStatus = "running" | "stale" | "hidden";

export interface AccessIp {
  ip: string;
  kind: "lan" | "vpn" | "loopback" | "container" | "public" | "other";
  iface?: string;
  preferred?: boolean;
}

export interface Endpoint {
  id: string;
  service: string;
  container: string;
  image: string;
  stack?: string;
  scope: EndpointScope;
  source: EndpointSource;
  status: EndpointStatus;
  ip: string;
  port: number;
  protocol: "tcp" | "udp" | "sctp";
  containerPort?: number;
  network: string;
  networkId?: string;
  url?: string;
  tags: string[];
  favorite: boolean;
  hidden: boolean;
  confidence: number;
  updatedAt: string;
  accessIps?: AccessIp[];
  note?: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  service: string;
  image: string;
  stack: string;
  state: "running" | "exited" | "restarting";
  statusText: string;
  startedAt: string;
  restartCount: number;
  networks: {
    name: string;
    ip: string;
    ipv6?: string;
    gateway?: string;
    mac?: string;
  }[];
  endpointCount: number;
  color: string;
}

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  gateway: string;
  ipv6Subnet?: string;
  internal: boolean;
  containerCount: number;
  usedCount: number;
  totalCount: number;
  utilization: number;
  ipv6?: boolean;
  warning?: string;
  usedIps: {
    ip: string;
    kind: "container" | "gateway" | "host" | "reserved";
    container?: string;
    aliases?: string[];
  }[];
}

export interface RecentEvent {
  id: string;
  at: string;
  type: "added" | "removed" | "changed" | "warning";
  title: string;
  detail: string;
}

export interface OverviewStats {
  containers: number;
  endpoints: number;
  networks: number;
  conflicts: number;
  newToday: number;
  ipChanges: number;
}

export interface PortCell {
  port: number;
  protocol: "tcp" | "udp";
  state: "used" | "free" | "hidden" | "reserved" | "inferred";
  service?: string;
  endpointId?: string;
}

export interface TopologyNode {
  id: string;
  type: "host" | "network" | "container" | "endpoint";
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  status?: "running" | "warning" | "inferred";
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}
