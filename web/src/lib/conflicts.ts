import type { Endpoint } from "../types";

const hostScopes = new Set(["HOST", "LAN", "HOST_NET", "LOOPBACK"]);

export function isHostPortScope(scope: Endpoint["scope"]): boolean {
  return hostScopes.has(scope);
}

export function isActiveHostPortEndpoint(endpoint: Endpoint): boolean {
  return endpoint.status === "running" && isHostPortScope(endpoint.scope);
}

function ipFamily(ip: string): 4 | 6 {
  return ip.includes(":") ? 6 : 4;
}

export interface PortConflict {
  key: string;
  port: number;
  protocol: Endpoint["protocol"];
  services: string[];
  endpoints: Endpoint[];
}

function endpointAddressSet(endpoint: Endpoint): {
  wildcard: boolean;
  family: 4 | 6;
  ips: Set<string>;
} {
  const ips = new Set<string>();
  const wildcard = endpoint.ip === "0.0.0.0" || endpoint.ip === "::" || endpoint.ip === "";
  const family: 4 | 6 = endpoint.ip === "::" ? 6 : wildcard ? 4 : ipFamily(endpoint.ip);
  if (!wildcard) ips.add(endpoint.ip);
  for (const item of endpoint.accessIps ?? []) {
    if (item.ip && item.ip !== "0.0.0.0" && item.ip !== "::" && ipFamily(item.ip) === family) {
      ips.add(item.ip);
    }
  }
  return { wildcard, family, ips };
}

function isLoopback(ip: string): boolean {
  return ip.startsWith("127.") || ip === "::1";
}

function addressesOverlap(a: Endpoint, b: Endpoint): boolean {
  const left = endpointAddressSet(a);
  const right = endpointAddressSet(b);

  if (left.wildcard && right.wildcard) return left.family === right.family;
  if (left.family !== right.family) return false;
  if (left.wildcard) {
    for (const ip of right.ips) {
      if (left.ips.has(ip) || isLoopback(ip)) return true;
    }
    return false;
  }
  if (right.wildcard) {
    for (const ip of left.ips) {
      if (right.ips.has(ip) || isLoopback(ip)) return true;
    }
    return false;
  }
  for (const ip of left.ips) {
    if (right.ips.has(ip)) return true;
  }
  return false;
}

function ownerKey(endpoint: Endpoint): string {
  return endpoint.container && endpoint.container !== "—"
    ? endpoint.container
    : endpoint.service;
}

export function findPortConflicts(endpoints: Endpoint[]): PortConflict[] {
  const groups = new Map<string, Endpoint[]>();

  for (const endpoint of endpoints) {
    if (!isActiveHostPortEndpoint(endpoint)) continue;
    if (endpoint.source === "INFERRED" || endpoint.source === "PROXY_LABEL") continue;
    if (endpoint.protocol !== "tcp" && endpoint.protocol !== "udp") continue;
    const key = `${endpoint.port}/${endpoint.protocol}`;
    const group = groups.get(key);
    if (group) group.push(endpoint);
    else groups.set(key, [endpoint]);
  }

  const conflicts: PortConflict[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    const involved = new Set<Endpoint>();
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        if (ownerKey(a) === ownerKey(b)) continue;
        if (!addressesOverlap(a, b)) continue;
        involved.add(a);
        involved.add(b);
      }
    }
    if (involved.size < 2) continue;

    const list = Array.from(involved).sort((a, b) => a.service.localeCompare(b.service));
    const services = Array.from(new Set(list.map((item) => item.service)));
    if (services.length < 2) continue;

    conflicts.push({
      key,
      port: list[0].port,
      protocol: list[0].protocol,
      services,
      endpoints: list,
    });
  }

  return conflicts.sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol));
}
