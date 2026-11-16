import type { Endpoint, EndpointScope, EndpointSource } from "../../types";

const scopeAliases: Record<string, EndpointScope> = {
  host: "HOST",
  host_net: "HOST_NET",
  hostnet: "HOST_NET",
  container: "CONTAINER",
  lan: "LAN",
  overlay: "OVERLAY",
  loopback: "LOOPBACK",
  external: "EXTERNAL",
};

const sourceAliases: Record<string, EndpointSource> = {
  published: "PUBLISHED",
  publish: "PUBLISHED",
  host_listener: "HOST_LISTENER",
  hostlistener: "HOST_LISTENER",
  listener: "HOST_LISTENER",
  listen: "HOST_LISTENER",
  exposed: "EXPOSED",
  expose: "EXPOSED",
  internal: "EXPOSED",
  proxy_label: "PROXY_LABEL",
  proxy: "PROXY_LABEL",
  reverse_proxy: "PROXY_LABEL",
  reverse: "PROXY_LABEL",
  inferred: "INFERRED",
  infer: "INFERRED",
  manual: "MANUAL",
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/-/g, "_");
}

function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function parseBoolean(value: string): boolean | null {
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return null;
}

function endpointIps(endpoint: Endpoint): string[] {
  return [endpoint.ip, ...(endpoint.accessIps?.map((item) => item.ip) ?? [])]
    .filter(Boolean)
    .map((ip) => ip.toLowerCase());
}

function matchPort(endpoint: Endpoint, value: string): boolean {
  const match = value.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) return false;
  const from = Number(match[1]);
  const to = match[2] ? Number(match[2]) : from;
  const ports = [endpoint.port, endpoint.containerPort].filter(
    (port): port is number => typeof port === "number",
  );
  return ports.some((port) => port >= from && port <= to);
}

function matchKeyValue(
  endpoint: Endpoint,
  key: string,
  value: string,
  hidden: boolean,
): boolean | null {
  switch (key) {
    case "ip":
      return endpointIps(endpoint).some((ip) => ip.startsWith(value));
    case "net":
      return endpoint.network.toLowerCase().includes(value);
    case "tag":
      return endpoint.tags.some((tag) => tag.toLowerCase().includes(value));
    case "proto":
      return endpoint.protocol.toLowerCase() === value;
    case "scope": {
      const normalized = normalize(value);
      const scope = scopeAliases[normalized];
      return scope ? endpoint.scope === scope : normalize(endpoint.scope) === normalized;
    }
    case "source": {
      const normalized = normalize(value);
      const source = sourceAliases[normalized];
      return source ? endpoint.source === source : normalize(endpoint.source) === normalized;
    }
    case "state": {
      if (value === "inferred") return endpoint.source === "INFERRED";
      const state = hidden ? "hidden" : endpoint.status;
      return state === value;
    }
    case "hidden": {
      const expected = parseBoolean(value);
      return expected === null ? null : hidden === expected;
    }
    case "fav":
    case "favorite": {
      const expected = parseBoolean(value);
      return expected === null ? null : endpoint.favorite === expected;
    }
    default:
      return null;
  }
}

function matchToken(endpoint: Endpoint, token: string, hidden: boolean): boolean {
  if (token.startsWith(":")) return matchPort(endpoint, token.slice(1));

  const separator = token.indexOf(":");
  if (separator > 0) {
    const key = normalize(token.slice(0, separator));
    const value = token.slice(separator + 1);
    if (value) {
      const handled = matchKeyValue(endpoint, key, value, hidden);
      if (handled !== null) return handled;
    }
  }

  const haystack = [endpoint.service, endpoint.container, endpoint.image, ...endpoint.tags]
    .join(" ")
    .toLowerCase();
  return haystack.includes(token);
}

export function matchesEndpointQuery(endpoint: Endpoint, query: string, hidden: boolean): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  return tokens.every((token) => matchToken(endpoint, token, hidden));
}

export function queryRequestsHidden(query: string): boolean {
  return tokenize(query).some((token) => {
    if (!token.startsWith("hidden:")) return false;
    return parseBoolean(token.slice("hidden:".length)) === true;
  });
}
