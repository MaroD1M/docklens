import type { NetworkInfo } from "../../types";

export type CidrRelation = "same" | "contains" | "contained" | "overlap";

export interface CidrInfo {
  base: number;
  prefix: number;
  size: number;
}

export interface OverlapPair {
  a: NetworkInfo;
  b: NetworkInfo;
  relation: CidrRelation;
}

export const ipKindLabels: Record<NetworkInfo["usedIps"][number]["kind"], string> = {
  container: "容器",
  gateway: "网关",
  host: "宿主机",
  reserved: "保留",
};

export function ipv4ToNumber(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

export function numberToIpv4(value: number): string {
  const a = Math.floor(value / 16777216) % 256;
  const b = Math.floor(value / 65536) % 256;
  const c = Math.floor(value / 256) % 256;
  const d = value % 256;
  return `${a}.${b}.${c}.${d}`;
}

export function parseCidr(cidr: string): CidrInfo | null {
  const [ip, prefixText] = cidr.trim().split("/");
  if (!ip || prefixText === undefined || prefixText === "") return null;
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const address = ipv4ToNumber(ip);
  if (address === null) return null;
  const size = 2 ** (32 - prefix);
  const base = Math.floor(address / size) * size;
  return { base, prefix, size };
}

export function compareCidrs(a: string, b: string): CidrRelation | null {
  const left = parseCidr(a);
  const right = parseCidr(b);
  if (!left || !right) return null;

  const leftEnd = left.base + left.size - 1;
  const rightEnd = right.base + right.size - 1;

  if (left.base === right.base && left.prefix === right.prefix) return "same";
  if (left.base <= right.base && leftEnd >= rightEnd) return "contains";
  if (right.base <= left.base && rightEnd >= leftEnd) return "contained";
  if (left.base <= rightEnd && right.base <= leftEnd) return "overlap";
  return null;
}

export function usableHosts(cidr: string, limit = 254): string[] {
  const info = parseCidr(cidr);
  if (!info || info.size > 256) return [];
  const start = info.base + 1;
  const end = info.base + info.size - 2;
  const total = end - start + 1;
  if (total <= 0) return [];
  const count = Math.min(total, limit);
  const hosts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    hosts.push(numberToIpv4(start + index));
  }
  return hosts;
}

export function findOverlaps(networks: NetworkInfo[]): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < networks.length; i += 1) {
    for (let j = i + 1; j < networks.length; j += 1) {
      const relation = compareCidrs(networks[i].subnet, networks[j].subnet);
      if (relation) pairs.push({ a: networks[i], b: networks[j], relation });
    }
  }
  return pairs;
}

export function overlappingNetworks(
  networks: NetworkInfo[],
  target: NetworkInfo,
): { network: NetworkInfo; relation: CidrRelation }[] {
  const result: { network: NetworkInfo; relation: CidrRelation }[] = [];
  for (const network of networks) {
    if (network.id === target.id) continue;
    const relation = compareCidrs(target.subnet, network.subnet);
    if (relation) result.push({ network, relation });
  }
  return result;
}

export function uniqueSubnets(networks: NetworkInfo[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const network of networks) {
    if (!seen.has(network.subnet)) {
      seen.add(network.subnet);
      result.push(network.subnet);
    }
  }
  return result;
}

export function relationLabel(relation: CidrRelation): string {
  if (relation === "same") return "CIDR 相同";
  if (relation === "contains") return "包含";
  if (relation === "contained") return "被包含";
  return "部分重叠";
}
