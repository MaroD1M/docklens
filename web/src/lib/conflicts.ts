import type { Endpoint } from "../types";

const hostScopes = new Set(["HOST", "LAN", "HOST_NET", "LOOPBACK"]);

export interface PortConflict {
  key: string;
  port: number;
  protocol: Endpoint["protocol"];
  services: string[];
  endpoints: Endpoint[];
}

function endpointAddressSet(endpoint: Endpoint): { wildcard: boolean; ips: Set<string> } {
  const ips = new Set<string>();
  if (endpoint.ip && endpoint.ip !== "0.0.0.0" && endpoint.ip !== "::") {
    ips.add(endpoint.ip);
  }
  for (const item of endpoint.accessIps ?? []) {
    if (item.ip && item.ip !== "0.0.0.0" && item.ip !== "::") {
      ips.add(item.ip);
    }
  }
  return {
    wildcard: endpoint.ip === "0.0.0.0" || endpoint.ip === "::" || endpoint.ip === "",
    ips,
  };
}

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1";
}

function addressesOverlap(a: Endpoint, b: Endpoint): boolean {
  const left = endpointAddressSet(a);
  const right = endpointAddressSet(b);

  if (left.wildcard && right.wildcard) return true;
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
    if (!hostScopes.has(endpoint.scope)) continue;
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
